const pool = require('../config/db');
const {
  normalizeBarangayName,
  resolveBarangayAtLocation,
} = require('../services/barangayBoundaryService');
const { syncFloodSensorAlerts } = require('../services/floodSensorAlertService');
const { lockEvacuationCapacity } = require('../services/evacuationRoutingService');

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

async function publishFloodSensorAlert(req, res) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  // Kept as a compatibility trigger for older cached admin bundles. Sensor
  // values and event identity are owned by the backend to prevent duplicates.
  await syncFloodSensorAlerts();
  return res.json({ synchronized: true });
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
       LEAST(ea.evacuees, ea.capacity)::int AS rescued_evacuees,
       LEAST(ea.evacuees + COALESCE(stats.incoming_total, 0), ea.capacity)::int AS evacuees,
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

  const cap = Number(capacity || 0);
  const evac = Number(evacuees || 0);
  if (!Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(evac) || evac < 0) {
    return res.status(400).json({ message: 'Capacity and evacuees must be non-negative whole numbers.' });
  }
  if (evac > cap) {
    return res.status(400).json({ message: 'The number of evacuees cannot exceed capacity.' });
  }
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

  const cap = Number(capacity || 0);
  const evac = Number(evacuees || 0);
  if (!Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(evac) || evac < 0) {
    return res.status(400).json({ message: 'Capacity and evacuees must be non-negative whole numbers.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockEvacuationCapacity(client);
    const incomingResult = await client.query(
      `SELECT COALESCE(SUM(evacuees_reserved), 0)::int AS total
       FROM incident_reports
       WHERE evacuation_area_id = $1
         AND report_type = 'rescue'
         AND status IN ('accepted', 'in_progress')
         AND evacuation_arrived_at IS NULL`,
      [id],
    );
    const incoming = Number(incomingResult.rows[0]?.total || 0);
    if (evac + incoming > cap) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Capacity cannot be lower than the ${evac + incoming} current and incoming evacuees.` });
    }
    const result = await client.query(
      `UPDATE evacuation_areas
       SET name = $1, barangay = $2, place_type = $3, address = $4,
           latitude = $5, longitude = $6, capacity = $7, evacuees = $8, is_active = $9
       WHERE id = $10
       RETURNING id, name, barangay, place_type, address, latitude, longitude, capacity, evacuees, is_active, created_at`,
      [String(name || '').trim(), canonicalBarangay, String(placeType || '').trim() || null,
        String(address || '').trim() || null, lat, lon, cap, evac, Boolean(isActive ?? true), id],
    );
    const updated = result.rows[0];
    if (!updated) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Evacuation area not found.' });
    }
    await client.query('COMMIT');
    return res.json(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
