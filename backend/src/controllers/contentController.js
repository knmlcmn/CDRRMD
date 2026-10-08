const pool = require('../config/db');
const {
  normalizeBarangayName,
  resolveBarangayAtLocation,
} = require('../services/barangayBoundaryService');

async function resolveCanonicalBarangayName(rawBarangay, latitude, longitude) {
  const result = await pool.query(
    `SELECT barangay_name, centroid_lat, centroid_lon
     FROM barangay_boundaries
     ORDER BY barangay_name ASC`,
  );

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const boundaryBarangay = resolveBarangayAtLocation(lat, lon);
  if (!boundaryBarangay) return null;

  const supported = result.rows.find(
    (row) => normalizeBarangayName(row.barangay_name) === normalizeBarangayName(boundaryBarangay),
  );
  if (!supported) return null;

  const requestedKey = normalizeBarangayName(rawBarangay);
  // Nominatim sometimes returns the municipality (Calamba) when a result has
  // no barangay-level address field. In that case, trust the verified polygon
  // match instead of treating the city name as a conflicting barangay.
  const isCalambaMunicipalityFallback = ['calamba', 'calamba city', 'city of calamba'].includes(requestedKey);
  if (
    requestedKey &&
    !isCalambaMunicipalityFallback &&
    requestedKey !== normalizeBarangayName(supported.barangay_name)
  ) {
    const error = new Error(`The selected location is inside Barangay ${supported.barangay_name}, not Barangay ${String(rawBarangay).trim()}.`);
    error.code = 'BARANGAY_BOUNDARY_MISMATCH';
    error.status = 400;
    throw error;
  }

  return supported.barangay_name;
}

async function getAlerts(req, res) {
  const result = await pool.query(
    'SELECT id, title, body, category, severity, created_at FROM alerts ORDER BY created_at DESC LIMIT 50',
  );
  return res.json(result.rows);
}

async function createAlert(req, res) {
  const { title, body, category, severity } = req.body;
  if (!title || !body) {
    return res.status(400).json({ message: 'Title and body are required.' });
  }

  const result = await pool.query(
    `INSERT INTO alerts (title, body, category, severity, posted_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, body, category, severity, created_at`,
    [title, body, category || 'general', severity || 'medium', req.user.userId],
  );

  return res.status(201).json(result.rows[0]);
}

const SUPPORTED_SENSOR_BARANGAYS = ['Palingon', 'Sampiruhan', 'Lingga', 'Parian', 'Looc', 'Uwisan'];

function canonicalSensorBarangay(value) {
  const normalized = String(value || '').toLowerCase().replace(/^(brgy\.?|barangay)\s+/, '').trim();
  return SUPPORTED_SENSOR_BARANGAYS.find((name) => name.toLowerCase() === normalized) || null;
}

async function publishFloodSensorAlert(req, res) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  const eventKey = String(req.body?.eventKey || '').trim();
  const barangayName = canonicalSensorBarangay(req.body?.barangayName);
  const level = String(req.body?.level || '').trim().toLowerCase();
  const percentage = Number(req.body?.waterLevelPercentage);
  const hardwareNo = String(req.body?.hardwareNo || '').trim() || null;
  const sensorUpdatedAt = req.body?.updatedAt ? new Date(req.body.updatedAt) : null;

  if (!eventKey || !barangayName || !['moderate', 'high'].includes(level) || !Number.isFinite(percentage)) {
    return res.status(400).json({ message: 'A valid event, barangay, medium/high level, and percentage are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO flood_sensor_alert_events
         (event_key, barangay_name, hardware_no, level, water_level_percentage, sensor_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_key, level) DO NOTHING
       RETURNING id`,
      [eventKey, barangayName, hardwareNo, level, Math.max(0, Math.min(100, percentage)), sensorUpdatedAt],
    );

    const severityLabel = level === 'high' ? 'High' : 'Medium';
    const title = `${severityLabel} flood warning`;
    const body = `Barangay ${barangayName} has reached a ${severityLabel.toLowerCase()} water level (${Math.round(percentage)}%) according to ${hardwareNo || 'the local water sensor'}. Stay alert and follow barangay safety instructions.`;
    const recipients = await client.query(
      `INSERT INTO user_notifications
         (user_id, report_id, title, body, category, severity, barangay_name, source_event_key)
       SELECT id, NULL, $1, $2, 'flood_sensor', $3, $4::varchar, $5
       FROM users
       WHERE role = 'user'
         AND COALESCE(is_archived, FALSE) = FALSE
         AND location_updated_at >= NOW() - INTERVAL '30 minutes'
         AND LOWER(COALESCE(current_barangay_name, '')) = LOWER($4::varchar)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [title, body, level, barangayName, eventKey],
    );

    await client.query('COMMIT');
    return res.status(inserted.rows.length > 0 ? 201 : 200).json({
      published: inserted.rows.length > 0,
      duplicate: inserted.rows.length === 0,
      recipients: recipients.rows.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getAnnouncements(req, res) {
  const result = await pool.query(
    'SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT 50',
  );
  return res.json(result.rows);
}

async function createAnnouncement(req, res) {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ message: 'Title and body are required.' });
  }

  const result = await pool.query(
    `INSERT INTO announcements (title, body, posted_by)
     VALUES ($1, $2, $3)
     RETURNING id, title, body, created_at`,
    [title, body, req.user.userId],
  );

  return res.status(201).json(result.rows[0]);
}

async function getEvacuationAreas(req, res) {
  const result = await pool.query(
    `SELECT
       ea.id,
       ea.name,
       ea.barangay,
       ea.place_type,
       ea.address,
       ea.latitude,
       ea.longitude,
       ea.capacity,
       ea.evacuees::int AS rescued_evacuees,
       (ea.evacuees + COALESCE(stats.incoming_total, 0))::int AS evacuees,
       GREATEST(ea.capacity - ea.evacuees - COALESCE(stats.incoming_total, 0), 0)::int AS available_slots,
       GREATEST(ea.capacity - ea.evacuees, 0)::int AS rescued_available_slots,
       CASE
         WHEN ea.capacity <= 0 THEN 'full'
         WHEN ea.evacuees + COALESCE(stats.incoming_total, 0) >= ea.capacity THEN 'full'
         WHEN ea.evacuees + COALESCE(stats.incoming_total, 0) >= (ea.capacity * 0.85) THEN 'nearly_full'
         ELSE 'available'
       END AS evacuation_status,
       CASE
         WHEN ea.capacity <= 0 THEN 'full'
         WHEN ea.evacuees >= ea.capacity THEN 'full'
         WHEN ea.evacuees >= (ea.capacity * 0.85) THEN 'nearly_full'
         ELSE 'available'
       END AS rescued_evacuation_status,
       ea.is_active,
       ea.created_at
     FROM evacuation_areas ea
     LEFT JOIN (
       SELECT
         evacuation_area_id,
         COALESCE(SUM(evacuees_reserved), 0)::int AS incoming_total
       FROM incident_reports
       WHERE report_type = 'rescue'
         AND evacuation_area_id IS NOT NULL
         AND status IN ('accepted', 'in_progress')
         AND evacuation_arrived_at IS NULL
       GROUP BY evacuation_area_id
      ) stats ON stats.evacuation_area_id = ea.id
      ORDER BY ea.name ASC`,
  );
  return res.json(result.rows);
}

async function createEvacuationArea(req, res) {
  const { name, barangay, placeType, address, capacity, evacuees, latitude, longitude } = req.body || {};

  if (!name || !barangay) {
    return res.status(400).json({ message: 'Name and barangay are required.' });
  }

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: 'Latitude and longitude must be valid numbers.' });
  }

  const cap = Math.max(0, Number(capacity || 0));
  const evac = Math.max(0, Number(evacuees || 0));
  const canonicalBarangay = await resolveCanonicalBarangayName(barangay, lat, lon);
  if (!canonicalBarangay) {
    return res.status(400).json({ message: 'Please select a valid Calamba barangay.' });
  }

  const result = await pool.query(
    `INSERT INTO evacuation_areas (name, barangay, place_type, address, latitude, longitude, capacity, evacuees, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
     RETURNING id, name, barangay, place_type, address, latitude, longitude, capacity, evacuees, is_active, created_at`,
    [
      String(name).trim(),
      canonicalBarangay,
      String(placeType || '').trim() || null,
      String(address || '').trim() || null,
      lat,
      lon,
      cap,
      evac,
    ],
  );

  return res.status(201).json(result.rows[0]);
}

async function updateEvacuationArea(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid evacuation area id.' });
  }

  const { name, barangay, placeType, address, capacity, evacuees, latitude, longitude, isActive } = req.body || {};
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: 'Latitude and longitude must be valid numbers.' });
  }
  const canonicalBarangay = await resolveCanonicalBarangayName(barangay, lat, lon);
  if (!canonicalBarangay) {
    return res.status(400).json({ message: 'Please select a valid Calamba barangay.' });
  }

  const result = await pool.query(
    `UPDATE evacuation_areas
     SET
       name = $1,
       barangay = $2,
       place_type = $3,
       address = $4,
       latitude = $5,
       longitude = $6,
       capacity = $7,
       evacuees = $8,
       is_active = $9
     WHERE id = $10
     RETURNING id, name, barangay, place_type, address, latitude, longitude, capacity, evacuees, is_active, created_at`,
    [
      String(name || '').trim(),
      canonicalBarangay,
      String(placeType || '').trim() || null,
      String(address || '').trim() || null,
      lat,
      lon,
      Math.max(0, Number(capacity || 0)),
      Math.max(0, Number(evacuees || 0)),
      Boolean(isActive ?? true),
      id,
    ],
  );

  const updated = result.rows[0];
  if (!updated) {
    return res.status(404).json({ message: 'Evacuation area not found.' });
  }

  return res.json(updated);
}

async function deleteEvacuationArea(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid evacuation area id.' });
  }

  const result = await pool.query('DELETE FROM evacuation_areas WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Evacuation area not found.' });
  }

  return res.status(204).send();
}

async function getDashboardSummary(req, res) {
  const [rescueAlertsRes, activeTeamsRes, areasRes, evacueesRes, latestReportsRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM incident_reports
       WHERE report_type = 'rescue'
         AND status IN ('pending', 'accepted', 'in_progress')`,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT assigned_team)::int AS count
       FROM incident_reports
       WHERE report_type = 'rescue'
         AND status IN ('accepted', 'in_progress')
         AND assigned_team IS NOT NULL
         AND TRIM(assigned_team) <> ''`,
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM evacuation_areas WHERE is_active = TRUE'),
    pool.query(
      `SELECT COALESCE(SUM(evacuees), 0)::int AS total
       FROM evacuation_areas
       WHERE is_active = TRUE`,
    ),
    pool.query(
      `SELECT
         ir.report_code,
         ir.report_type,
         ir.incident_type,
         ir.location,
         ir.latitude,
         ir.longitude,
         ir.status,
         ir.created_at,
         u.first_name,
         u.last_name
       FROM incident_reports ir
       LEFT JOIN users u ON u.id = ir.reported_by
       WHERE ir.report_type = 'rescue'
       ORDER BY ir.created_at DESC`,
    ),
  ]);

  const reportIncidents = latestReportsRes.rows.map((item) => {
    const firstName = item.first_name || '';
    const lastName = item.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return {
      caseId: item.report_code,
      type: item.report_type || item.incident_type || 'incident',
      requesterName: fullName || 'Unknown',
      location: item.location || 'Calamba City',
      latitude: item.latitude,
      longitude: item.longitude,
      status: item.report_type === 'rescue' ? (item.status || 'pending') : '',
      title: item.incident_type || item.report_type || 'Incident Report',
      createdAt: item.created_at,
    };
  });

  const incidents = [...reportIncidents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({
    cards: {
      emergencyAlerts: rescueAlertsRes.rows[0]?.count ?? 0,
      activeTeams: activeTeamsRes.rows[0]?.count ?? 0,
      evacuationAreas: areasRes.rows[0]?.count ?? 0,
      totalEvacuees: evacueesRes.rows[0]?.total ?? 0,
    },
    incidents,
  });
}

module.exports = {
  getAlerts,
  createAlert,
  publishFloodSensorAlert,
  getAnnouncements,
  createAnnouncement,
  getEvacuationAreas,
  createEvacuationArea,
  updateEvacuationArea,
  deleteEvacuationArea,
  getDashboardSummary,
};
