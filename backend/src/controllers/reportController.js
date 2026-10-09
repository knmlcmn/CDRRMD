const pool = require('../config/db');
const userModel = require('../models/userModel');
const {
  resolveBarangayAtLocation,
  resolveNearbyBarangayAtLocation,
} = require('../services/barangayJurisdictionService');
const {
  SUPPORTED_BARANGAYS: FLOOD_ALERT_BARANGAYS,
  isSupportedBarangay,
} = require('../services/supportedBarangays');
const FLOOD_ALERT_NEARBY_KM = Number(process.env.FLOOD_ALERT_NEARBY_KM || 2.5);
const { assignNearestAvailableRescuer } = require('../services/rescuerDispatchService');
const {
  evacuationAreaStillHasCapacity,
  findNearestAvailableEvacuationArea,
} = require('../services/evacuationRoutingService');
const { syncFloodSensorAlerts } = require('../services/floodSensorAlertService');

function buildReportCode(id, createdAt) {
  const year = new Date(createdAt || Date.now()).getFullYear();
  return `RPT-${year}-${String(id).padStart(6, '0')}`;
}

function toBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'no' || normalized === 'false' || normalized === '0') {
    return false;
  }
  return null;
}

const ALLOWED_REPORT_TYPES = ['flood', 'rescue'];
const WORKFLOW_STATUSES = ['pending', 'accepted', 'in_progress', 'resolved', 'declined'];

function ensureAdmin(req, res) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required.' });
    return false;
  }
  return true;
}

async function reportBelongsToBarangay(reportId, barangayName) {
  const targetBarangay = String(barangayName || '').trim();
  if (!targetBarangay) {
    return false;
  }

  const result = await pool.query(
    `SELECT 1 FROM incident_reports
     WHERE id = $1 AND LOWER(assigned_barangay) = LOWER($2)
     LIMIT 1`,
    [reportId, targetBarangay],
  );
  return result.rows.length > 0;
}

async function createStatusLog(client, reportId, oldStatus, newStatus, changedBy, actionNote, metadata = {}) {
  await client.query(
    `INSERT INTO report_status_logs (
      report_id,
      old_status,
      new_status,
      changed_by,
      action_note,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [reportId, oldStatus, newStatus, changedBy || null, actionNote || null, metadata],
  );
}

async function createNotification(client, userId, reportId, title, body) {
  await client.query(
    `INSERT INTO user_notifications (user_id, report_id, title, body)
     VALUES ($1, $2, $3, $4)`,
    [userId, reportId, title, body],
  );
}

async function completeBackupResponse(client, reportId, confirmedBy) {
  await client.query(
    `UPDATE backup_requests
     SET arrived_at = COALESCE(arrived_at, NOW()),
         confirmed_by = COALESCE(confirmed_by, $2)
     WHERE report_id = $1 AND arrived_at IS NULL`,
    [reportId, confirmedBy || null],
  );
}

function parseLocationCoordinates(rawLatitude, rawLongitude, locationText) {
  const lat = rawLatitude === null || rawLatitude === undefined || rawLatitude === '' ? null : Number(rawLatitude);
  const lon = rawLongitude === null || rawLongitude === undefined || rawLongitude === '' ? null : Number(rawLongitude);

  if (lat !== null && lon !== null) {
    return { latitude: lat, longitude: lon };
  }

  const text = String(locationText || '');
  const matched = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!matched) {
    return { latitude: null, longitude: null };
  }

  return {
    latitude: Number(matched[1]),
    longitude: Number(matched[2]),
  };
}

async function resolveNearestRescueTeam(client, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const nearest = await client.query(
    `SELECT id, name, barangay, latitude, longitude
     FROM evacuation_areas
     WHERE is_active = TRUE
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
     ORDER BY ((latitude - $1) * (latitude - $1) + (longitude - $2) * (longitude - $2)) ASC
     LIMIT 1`,
    [latitude, longitude],
  );

  const area = nearest.rows[0];
  if (!area) {
    return null;
  }

  return `${area.name} Response Team (${area.barangay})`;
}

async function ensureReportWorkflowColumns(client) {
  await client.query(`
    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(200);

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS admin_notes TEXT;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(120);

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS decline_explanation TEXT;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS evacuation_area_id INTEGER REFERENCES evacuation_areas(id) ON DELETE SET NULL;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS evacuation_area_name VARCHAR(180);

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS evacuees_reserved INTEGER NOT NULL DEFAULT 1;
  `);
}

async function createReport(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Invalid token payload.' });
  }

  const {
    reportType,
    location,
    latitude,
    longitude,
    evacuationAreaId,
    evacuationAreaName,
    incidentType,
    waterLevel,
    arePeopleTrapped,
    estimatedPeople,
    notes,
    imageBase64,
    fullName,
    contactNumber,
    testModeBypassServiceArea,
  } = req.body || {};

  const normalizedType = String(reportType || '').trim().toLowerCase();
  if (!ALLOWED_REPORT_TYPES.includes(normalizedType)) {
    return res.status(400).json({ message: 'reportType must be flood or rescue.' });
  }

  const locationText = String(location || '').trim();
  if (!locationText) {
    return res.status(400).json({ message: 'Location is required.' });
  }

  const normalizedIncidentType =
    String(incidentType || '').trim() ||
    (normalizedType === 'rescue' ? 'Request Rescue' : 'General Incident');
  if (!normalizedIncidentType) {
    return res.status(400).json({ message: 'Incident type is required.' });
  }

  const waterLevelText = normalizedType === 'flood' ? String(waterLevel || '').trim() : null;
  if (normalizedType === 'flood' && !waterLevelText) {
    return res.status(400).json({ message: 'Water level is required for flood reports.' });
  }

  const details =
    String(notes || '').trim() ||
    (normalizedType === 'rescue'
      ? 'Rescue request submitted via mobile app.'
      : 'Incident report submitted via mobile app.');

  const estimatedPeopleValue = String(estimatedPeople || '').trim();
  const estimatedPeopleInt = estimatedPeopleValue ? Number(estimatedPeopleValue) : null;
  if (estimatedPeopleValue && !Number.isFinite(estimatedPeopleInt)) {
    return res.status(400).json({ message: 'Estimated people must be a number.' });
  }
  if (normalizedType === 'rescue'
    && (!Number.isInteger(estimatedPeopleInt) || estimatedPeopleInt < 1 || estimatedPeopleInt > 100)) {
    return res.status(400).json({ message: 'People needing rescue must be a whole number from 1 to 100.' });
  }
  const rescuePartySize = normalizedType === 'rescue' ? estimatedPeopleInt : 1;

  const safeImageBase64 = String(imageBase64 || '').trim() || null;
  if (!safeImageBase64) {
    return res.status(400).json({ message: 'Uploaded photo is required.' });
  }

  const extracted = parseLocationCoordinates(latitude, longitude, locationText);
  if (!Number.isFinite(extracted.latitude) || !Number.isFinite(extracted.longitude)) {
    return res.status(400).json({ message: 'GPS latitude and longitude are required.' });
  }

  const lat = Number(extracted.latitude);
  const lon = Number(extracted.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: 'Latitude/longitude must be valid numbers.' });
  }

  const userResult = await pool.query(
    `SELECT id, first_name, last_name, contact_number, email, barangay_name
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const serviceAreaBypassEnabled =
    normalizedType === 'rescue' &&
    testModeBypassServiceArea === true;
  const locationBarangay = resolveBarangayAtLocation(lat, lon);
  const supportedLocationBarangay = isSupportedBarangay(locationBarangay) ? locationBarangay : null;
  const nearestTestBarangay = serviceAreaBypassEnabled
    ? resolveNearbyBarangayAtLocation(lat, lon, FLOOD_ALERT_BARANGAYS, Number.POSITIVE_INFINITY)?.name
    : null;
  const serviceAreaBarangay = supportedLocationBarangay || nearestTestBarangay || null;
  if (!serviceAreaBarangay) {
    return res.status(422).json({
      message: 'This location is outside the supported barangay jurisdiction. The report cannot be submitted.',
      code: 'OUTSIDE_BARANGAY_JURISDICTION',
    });
  }

  const submittedName = String(fullName || '').trim();
  const profileName = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim();
  const finalFullName = submittedName || profileName || String(user.email || '').trim() || `User ${userId}`;

  const submittedContact = String(contactNumber || '').trim();
  const finalContact = submittedContact || String(user.contact_number || '').trim() || 'N/A';

  const duplicateWindowMinutes = Number(process.env.REPORT_DUPLICATE_WINDOW_MINUTES || 10);
  const duplicateCheck = await pool.query(
    `SELECT id, report_code
     FROM incident_reports
     WHERE reported_by = $1
       AND report_type = $2
       AND status IN ('pending', 'accepted', 'in_progress')
       AND created_at >= NOW() - ($3::text || ' minutes')::interval
       AND (
         location = $4
         OR (
           latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND ABS(latitude - $5) < 0.0008
           AND ABS(longitude - $6) < 0.0008
         )
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, normalizedType, duplicateWindowMinutes, locationText, lat, lon],
  );

  if (duplicateCheck.rows.length > 0) {
    return res.status(409).json({
      message: 'Duplicate report detected. Please wait before submitting the same incident again.',
      duplicateReportCode: duplicateCheck.rows[0].report_code || null,
    });
  }

  const normalizedStatus = 'pending';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let assignedBarangay = serviceAreaBarangay;
    let resolvedAreaId = null;
    let resolvedAreaName = null;
    let evacuationReassigned = false;

    if (normalizedType === 'rescue') {
      // The client recommendation is calculated from the live road network.
      // Revalidate its capacity under the transaction lock, then preserve it.
      const availableArea = await findNearestAvailableEvacuationArea(
        client,
        lat,
        lon,
        {
          preferredAreaId: evacuationAreaId,
          requirePreferredArea: true,
          requiredSlots: rescuePartySize,
        },
      );
      if (!availableArea) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'The road-recommended evacuation center is no longer available. Please calculate a new route and try again.',
          code: 'NO_AVAILABLE_EVACUATION_AREA',
        });
      }

      resolvedAreaId = Number(availableArea.id);
      resolvedAreaName = String(availableArea.name || '').trim() || String(evacuationAreaName || '').trim() || null;
      const evacuationBarangay = String(availableArea.barangay || '').trim();
      if (!isSupportedBarangay(evacuationBarangay)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'The selected evacuation center is not assigned to a supported barangay portal.',
          code: 'EVACUATION_AREA_WITHOUT_SUPPORTED_BARANGAY',
        });
      }
      const requestedAreaId = Number(evacuationAreaId);
      evacuationReassigned = Number.isFinite(requestedAreaId) ? requestedAreaId !== resolvedAreaId : false;
    }

    const inserted = await client.query(
      `INSERT INTO incident_reports (
        report_code,
        report_type,
        location,
        latitude,
        longitude,
        assigned_barangay,
        incident_type,
        water_level,
        are_people_trapped,
        estimated_people,
        notes,
        image_base64,
        reported_by,
        status,
        evacuation_area_id,
        evacuation_area_name,
        evacuees_reserved
      )
      VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, created_at`,
      [
        normalizedType,
        locationText,
        lat,
        lon,
        assignedBarangay,
        normalizedIncidentType,
        waterLevelText,
        toBool(arePeopleTrapped),
        Number.isFinite(estimatedPeopleInt) ? estimatedPeopleInt : null,
        details,
        safeImageBase64,
        userId,
        normalizedStatus,
        resolvedAreaId,
        resolvedAreaName,
        normalizedType === 'rescue' ? rescuePartySize : 0,
      ],
    );

    const created = inserted.rows[0];
    const reportCode = buildReportCode(created.id, created.created_at);

    const updated = await client.query(
      `UPDATE incident_reports
       SET report_code = $1,
           updated_at = NOW(),
           updated_by = $3
       WHERE id = $2
       RETURNING id, report_code, report_type, location, latitude, longitude, assigned_barangay, incident_type, water_level, are_people_trapped, estimated_people, notes, image_base64, reported_by, status, evacuation_area_id, evacuation_area_name, evacuees_reserved, created_at, updated_at`,
      [reportCode, created.id, userId],
    );

    const report = updated.rows[0];

    try {
      await createStatusLog(
        client,
        report.id,
        null,
        normalizedStatus,
        userId,
        'Report submitted by user',
        {
          fullName: finalFullName,
          contactNumber: finalContact,
          reportType: normalizedType,
          evacuationAreaId: resolvedAreaId,
          evacuationAreaName: resolvedAreaName,
          evacuationReassigned,
        },
      );
    } catch (logError) {
      // Keep report creation successful even if audit logging fails.
      console.error('Failed to write initial report status log:', logError.message);
    }

    try {
      await createNotification(
        client,
        userId,
        report.id,
        'Report submitted',
        `Your ${normalizedType} report (${report.report_code}) is now pending review.`,
      );
    } catch (notificationError) {
      // Keep report creation successful even if notification insert fails.
      console.error('Failed to write initial report notification:', notificationError.message);
    }

    await client.query('COMMIT');
    return res.status(201).json({
      ...report,
      message: 'Report submitted successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to create report:', error.message);
    return res.status(500).json({ message: 'Failed to submit report. Please retry.' });
  } finally {
    client.release();
  }
}

async function getMyReports(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Invalid token payload.' });
  }

  const result = await pool.query(
    `SELECT
      r.id,
      r.report_code,
      r.report_type,
      r.location,
      r.latitude,
      r.longitude,
      r.incident_type,
      r.water_level,
      r.are_people_trapped,
      r.estimated_people,
      r.notes,
      r.image_base64,
      r.status,
      r.evacuation_area_id,
      r.evacuation_area_name,
      r.evacuees_reserved,
      r.assigned_team,
      r.admin_notes,
      r.decline_reason,
      r.decline_explanation,
      r.dispatched_at,
      r.resolved_at,
      r.created_at,
      r.updated_at,
      r.evacuation_arrived_at,
      ea.latitude AS evacuation_latitude,
      ea.longitude AS evacuation_longitude,
      dispatch.id AS dispatch_id,
      dispatch.dispatch_type,
      dispatch.assigned_rescuer_id,
      dispatch.assigned_at AS rescuer_assigned_at,
      dispatch.responder_acknowledged_at,
      dispatch.picked_up_at,
      NULLIF(TRIM(CONCAT_WS(' ', responder.first_name, responder.last_name)), '') AS rescuer_name,
      responder.current_latitude AS rescuer_latitude,
      responder.current_longitude AS rescuer_longitude,
      responder.location_updated_at AS rescuer_location_updated_at
     FROM incident_reports r
     LEFT JOIN evacuation_areas ea ON ea.id = r.evacuation_area_id
     LEFT JOIN LATERAL (
       SELECT br.id, br.dispatch_type, br.assigned_rescuer_id, br.assigned_at,
              br.responder_acknowledged_at, br.picked_up_at
       FROM backup_requests br
       WHERE br.report_id = r.id AND br.assigned_rescuer_id IS NOT NULL
         AND br.arrived_at IS NULL AND br.declined_at IS NULL
       ORDER BY CASE WHEN br.dispatch_type = 'cddrmd_backup' THEN 0 ELSE 1 END,
         br.assigned_at DESC NULLS LAST, br.id DESC
       LIMIT 1
     ) dispatch ON TRUE
     LEFT JOIN users responder ON responder.id = dispatch.assigned_rescuer_id
     WHERE r.reported_by = $1
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [userId],
  );

  return res.json(result.rows);
}

async function getReports(req, res) {
  if (!ensureAdmin(req, res)) {
    return;
  }

  const result = await pool.query(
    `SELECT
      r.id,
      r.report_code,
      r.report_type,
      r.location,
      r.latitude,
      r.longitude,
      r.incident_type,
      r.water_level,
      r.are_people_trapped,
      r.estimated_people,
      r.notes,
      (r.image_base64 IS NOT NULL AND r.image_base64 <> '') AS has_image,
      r.status,
      r.evacuation_area_id,
      r.evacuation_area_name,
      r.evacuees_reserved,
      r.assigned_team,
      r.admin_notes,
      r.decline_reason,
      r.decline_explanation,
      r.dispatched_at,
      r.resolved_at,
      r.updated_at,
      r.updated_by,
      r.created_at,
      ea.latitude AS evacuation_latitude,
      ea.longitude AS evacuation_longitude,
      dispatch.id AS dispatch_id,
      dispatch.dispatch_type,
      dispatch.assigned_rescuer_id,
      dispatch.assigned_at AS rescuer_assigned_at,
      dispatch.responder_acknowledged_at,
      dispatch.picked_up_at,
      NULLIF(TRIM(CONCAT_WS(' ', responder.first_name, responder.last_name)), '') AS rescuer_name,
      responder.current_latitude AS rescuer_latitude,
      responder.current_longitude AS rescuer_longitude,
      responder.location_updated_at AS rescuer_location_updated_at,
      u.id AS reporter_id,
      u.first_name,
      u.last_name,
      u.contact_number,
      u.email
     FROM incident_reports r
     JOIN users u ON u.id = r.reported_by
     LEFT JOIN evacuation_areas ea ON ea.id = r.evacuation_area_id
     LEFT JOIN LATERAL (
       SELECT br.id, br.dispatch_type, br.assigned_rescuer_id, br.assigned_at,
              br.responder_acknowledged_at, br.picked_up_at
       FROM backup_requests br
       WHERE br.report_id = r.id AND br.assigned_rescuer_id IS NOT NULL
         AND br.arrived_at IS NULL AND br.declined_at IS NULL
       ORDER BY CASE WHEN br.dispatch_type = 'cddrmd_backup' THEN 0 ELSE 1 END,
         br.assigned_at DESC NULLS LAST, br.id DESC
       LIMIT 1
     ) dispatch ON TRUE
     LEFT JOIN users responder ON responder.id = dispatch.assigned_rescuer_id
     ORDER BY r.created_at DESC
     LIMIT 200`,
  );

  return res.json(result.rows);
}

async function getReportImage(req, res) {
  const reportId = Number(req.params.id);
  if (!Number.isSafeInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ message: 'Invalid report.' });
  }

  const role = req.user?.role;
  if (!['admin', 'barangay'].includes(role)) {
    return res.status(403).json({ message: 'Admin or barangay access required.' });
  }

  const params = [reportId];
  let jurisdictionClause = '';
  if (role === 'barangay') {
    const barangayName = String(req.user?.barangayName || '').trim();
    if (!barangayName) return res.status(403).json({ message: 'No barangay assigned to this account.' });
    params.push(barangayName);
    jurisdictionClause = 'AND LOWER(assigned_barangay) = LOWER($2)';
  }

  const { rows } = await pool.query(
    `SELECT image_base64 FROM incident_reports
     WHERE id = $1 ${jurisdictionClause}
     LIMIT 1`,
    params,
  );
  if (!rows[0]) return res.status(404).json({ message: 'Report not found.' });
  if (!rows[0].image_base64) return res.status(404).json({ message: 'This report has no proof image.' });
  return res.json({ image_base64: rows[0].image_base64 });
}

async function getReportHistory(req, res) {
  const role = req.user?.role;
  if (!['admin', 'barangay'].includes(role)) {
    return res.status(403).json({ message: 'Admin or barangay access required.' });
  }

  const month = req.query?.month ? Number(req.query.month) : null;
  const year = req.query?.year ? Number(req.query.year) : null;
  const search = String(req.query?.search || '').trim().toLowerCase().slice(0, 120);
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return res.status(400).json({ message: 'Month must be between 1 and 12.' });
  }
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    return res.status(400).json({ message: 'Enter a valid year.' });
  }

  const barangayName = role === 'barangay' ? String(req.user?.barangayName || '').trim() : null;
  if (role === 'barangay' && !barangayName) {
    return res.status(403).json({ message: 'No barangay is assigned to this account.' });
  }

  const result = await pool.query(
    `SELECT r.id, r.report_code, r.report_type, r.incident_type, r.status,
            r.location, r.assigned_barangay, r.evacuation_area_name,
            r.created_at, r.resolved_at,
            u.id AS reporter_id,
            CONCAT('USR-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0')) AS reporter_account_id,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS reporter_name,
            u.username AS reporter_username, u.contact_number, u.email
     FROM incident_reports r
     LEFT JOIN users u ON u.id = r.reported_by
     WHERE ($1::text IS NULL OR LOWER(r.assigned_barangay) = LOWER($1))
       AND ($2::integer IS NULL OR EXTRACT(MONTH FROM r.created_at) = $2)
       AND ($3::integer IS NULL OR EXTRACT(YEAR FROM r.created_at) = $3)
       AND ($4::text = ''
         OR LOWER(COALESCE(r.report_code, '')) LIKE '%' || $4 || '%'
         OR LOWER(COALESCE(u.username, '')) LIKE '%' || $4 || '%'
         OR LOWER(COALESCE(CONCAT_WS(' ', u.first_name, u.last_name), '')) LIKE '%' || $4 || '%'
         OR LOWER(COALESCE(CONCAT('USR-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0')), '')) LIKE '%' || $4 || '%'
         OR COALESCE(u.id::text, '') = $4)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 1000`,
    [barangayName, month, year, search],
  );

  return res.json(result.rows);
}

async function updateReportStatus(req, res) {
  const requesterRole = req.user?.role;
  if (requesterRole !== 'barangay') {
    res.status(403).json({ message: 'Only the assigned barangay can validate resident rescue requests.' });
    return;
  }

  const reportId = Number(req.params.id);
  if (!Number.isFinite(reportId)) {
    return res.status(400).json({ message: 'Invalid report id.' });
  }

  const nextStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!WORKFLOW_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  const assignTeam = String(req.body?.assignTeam || '').trim();
  const notes = String(req.body?.notes || '').trim();
  const dispatchConfirmed = req.body?.dispatchConfirmed === true;
  const declineReason = String(req.body?.declineReason || '').trim();
  const declineExplanation = String(req.body?.declineExplanation || '').trim();

  const currentResult = await pool.query(
    `SELECT id, status, report_code, report_type, reported_by, latitude, longitude, evacuation_area_id, evacuation_area_name, evacuees_reserved
     FROM incident_reports
     WHERE id = $1
     LIMIT 1`,
    [reportId],
  );

  const current = currentResult.rows[0];
  if (!current) {
    return res.status(404).json({ message: 'Report not found.' });
  }
  if (current.report_type !== 'rescue') {
    return res.status(400).json({ message: 'Barangay validation is only available for resident rescue requests.' });
  }

  const isBarangayWorkflow = true;
  const barangayName = String(req.user?.barangayName || '').trim();
  if (isBarangayWorkflow) {
    if (!barangayName) {
      return res.status(400).json({ message: 'No barangay assigned to this account.' });
    }

    const canUpdate = await reportBelongsToBarangay(reportId, barangayName);
    if (!canUpdate) {
      return res.status(403).json({ message: 'Access denied for this report.' });
    }
  }

  const oldStatus = String(current.status || '').toLowerCase();
  // Barangay acceptance starts the response immediately. Pickup then keeps
  // the incident in progress until transport to the evacuation center ends.
  const allowedTransitions = isBarangayWorkflow
    ? {
        pending: ['accepted', 'declined'],
        accepted: [],
        in_progress: [],
        resolved: [],
        declined: [],
      }
    : {
        pending: ['accepted', 'declined'],
        accepted: ['in_progress', 'declined'],
        in_progress: ['resolved', 'declined'],
        resolved: [],
        declined: [],
      };

  if (!allowedTransitions[oldStatus]?.includes(nextStatus)) {
    return res.status(400).json({
      message: `Cannot change status from ${oldStatus || 'unknown'} to ${nextStatus}.`,
    });
  }

  if (nextStatus === 'accepted') {
    if (isBarangayWorkflow) {
      if (!notes) {
        return res.status(400).json({ message: 'Notes are required when accepting a report.' });
      }
    } else {
      if (current.report_type !== 'rescue' && !assignTeam) {
        return res.status(400).json({ message: 'Assigned rescue team is required when accepting a report.' });
      }
      if (!notes) {
        return res.status(400).json({ message: 'Admin notes are required when accepting a report.' });
      }
      if (!dispatchConfirmed) {
        return res.status(400).json({ message: 'Dispatch confirmation is required when accepting a report.' });
      }
    }
  }

  if (nextStatus === 'declined') {
    const allowedReasons = ['invalid report', 'duplicate', 'outside jurisdiction', 'false alarm', 'other'];
    if (!allowedReasons.includes(declineReason.toLowerCase())) {
      return res.status(400).json({ message: 'A valid decline reason is required.' });
    }
    if (!declineExplanation) {
      return res.status(400).json({ message: 'Decline explanation is required.' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isBarangayWorkflow) {
      // "Confirm Resident Rescued": barangay rescuer marks the resident as
      // rescued. This is the trigger that flips the routing destination from
      // the resident's location to the designated evacuation center.
      if (nextStatus === 'resolved') {
        if (current.report_type !== 'rescue') {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Only rescue requests can be marked as rescued.' });
        }

        // Prefer the evacuation area already assigned to this rescue (set when
        // the resident first requested rescue) as long as it still has room.
        let destinationArea = current.evacuation_area_id
          ? await evacuationAreaStillHasCapacity(client, current.evacuation_area_id)
          : null;

        // If the assigned center filled up, calculate another reachable center
        // from the resident's location using actual driving distance.
        if (!destinationArea) {
          destinationArea = await findNearestAvailableEvacuationArea(
            client,
            Number(current.latitude),
            Number(current.longitude),
          );
        }

        if (!destinationArea) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: 'No available evacuation area to route this rescued resident to. Please add capacity first.',
            code: 'NO_AVAILABLE_EVACUATION_AREA',
          });
        }

        const rescueNotes = String(req.body?.notes || '').trim() || null;

        const updateResult = await client.query(
          `UPDATE incident_reports
           SET
             status = 'resolved',
             evacuation_area_id = $1,
             evacuation_area_name = $2,
             evacuees_reserved = GREATEST(1, COALESCE(evacuees_reserved, 1)),
             admin_notes = COALESCE($3, admin_notes),
             resolved_at = NOW(),
             updated_at = NOW(),
             updated_by = $4
           WHERE id = $5
           RETURNING *`,
          [destinationArea.id, destinationArea.name, rescueNotes, req.user.userId, reportId],
        );

        const updated = updateResult.rows[0];
        const actionNote = `Resident rescued by Barangay ${barangayName || ''}. Routing to ${destinationArea.name}.`;

        try {
          await createStatusLog(
            client,
            reportId,
            oldStatus,
            'resolved',
            req.user.userId,
            actionNote,
            {
              barangayName: barangayName || null,
              evacuationAreaId: destinationArea.id,
              evacuationAreaName: destinationArea.name,
              notes: rescueNotes,
            },
          );
        } catch (logError) {
          console.error('Failed to write report status log:', logError.message);
        }

        try {
          await createNotification(
            client,
            current.reported_by,
            reportId,
            `Report ${current.report_code || reportId} updated`,
            `You have been rescued! You are now being routed to ${destinationArea.name}.`,
          );
        } catch (notificationError) {
          console.error('Failed to create report notification:', notificationError.message);
        }

        await completeBackupResponse(client, reportId, req.user.userId);

        await client.query('COMMIT');
        return res.json(updated);
      }

      // Acceptance immediately dispatches the nearest available responder. The
      // report stays accepted until responder GPS confirms arrival at the user.
      const effectiveBarangayStatus = nextStatus;
      const nextAdminNotes = nextStatus === 'accepted' ? notes : null;
      const nextDeclineReason = nextStatus === 'declined' ? declineReason : null;
      const nextDeclineExplanation = nextStatus === 'declined' ? declineExplanation : null;

      const updateResult = await client.query(
        `UPDATE incident_reports
         SET
           status = $1,
           admin_notes = COALESCE($2, admin_notes),
           decline_reason = COALESCE($3, decline_reason),
           decline_explanation = COALESCE($4, decline_explanation),
           updated_at = NOW(),
           updated_by = $5
         WHERE id = $6
         RETURNING *`,
        [
          effectiveBarangayStatus,
          nextAdminNotes,
          nextDeclineReason,
          nextDeclineExplanation,
          req.user.userId,
          reportId,
        ],
      );

      const updated = updateResult.rows[0];
      let automaticAssignment = null;
      if (nextStatus === 'accepted') {
        const dispatchResult = await client.query(
          `INSERT INTO backup_requests
             (barangay_name, requested_by, report_id, acknowledged_at, acknowledged_by, dispatch_type)
           VALUES ($1, $2, $3, NOW(), $2, 'barangay_responder')
           ON CONFLICT (report_id, dispatch_type)
             WHERE arrived_at IS NULL AND declined_at IS NULL AND report_id IS NOT NULL
           DO UPDATE SET requested_by = EXCLUDED.requested_by
           RETURNING id`,
          [barangayName, req.user.userId, reportId],
        );
        automaticAssignment = await assignNearestAvailableRescuer(
          client,
          dispatchResult.rows[0].id,
          'barangay_responder',
          req.user.userId,
        );
        const previewedRescuerId = Number(req.body?.rescuerId);
        if (Number.isSafeInteger(previewedRescuerId)
          && previewedRescuerId > 0
          && Number(automaticAssignment.assigned_rescuer_id) !== previewedRescuerId) {
          throw Object.assign(new Error('The nearest available Barangay Rescuer changed. Review the updated assignment and confirm again.'), { status: 409, code: 'RESPONDER_CHANGED' });
        }
        updated.assigned_team = automaticAssignment.teamLabel;
        updated.dispatched_at = automaticAssignment.assigned_at;
      }
      const actionNote = nextStatus === 'accepted'
        ? 'Barangay accepted the report and automatically dispatched the nearest available Barangay Rescuer.'
        : `Barangay declined the report: ${declineExplanation}`;

      try {
        await createStatusLog(
          client,
          reportId,
          oldStatus,
          effectiveBarangayStatus,
          req.user.userId,
          actionNote,
          {
            barangayName: req.user?.barangayName || null,
            notes: nextAdminNotes || null,
            declineReason: nextDeclineReason || null,
            declineExplanation: nextDeclineExplanation || null,
          },
        );
      } catch (logError) {
        console.error('Failed to write report status log:', logError.message);
      }

      // Automatic assignment already notifies accepted requests. Declines need
      // their own notification because no dispatch is created.
      if (nextStatus === 'declined') {
        try {
          await createNotification(
            client,
            current.reported_by,
            reportId,
            `Report ${current.report_code || reportId} updated`,
            `Your report was declined by the barangay. Reason: ${declineExplanation}`,
          );
        } catch (notificationError) {
          console.error('Failed to create report notification:', notificationError.message);
        }
      }

      await client.query('COMMIT');
      return res.json(updated);
    }

    let effectiveAssignTeam = assignTeam;
    let effectiveEvacuationAreaId = current.evacuation_area_id ? Number(current.evacuation_area_id) : null;
    let effectiveEvacuationAreaName = String(current.evacuation_area_name || '').trim() || null;
    let effectiveEvacueesReserved = Math.max(1, Number(current.evacuees_reserved || 1));

    if (nextStatus === 'accepted' && current.report_type === 'rescue') {
      const destinationArea = await findNearestAvailableEvacuationArea(
        client,
        Number(current.latitude),
        Number(current.longitude),
        { preferredAreaId: current.evacuation_area_id },
      );

      if (!destinationArea) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'No available evacuation area for this rescue case. Please add capacity first.',
          code: 'NO_AVAILABLE_EVACUATION_AREA',
        });
      }

      effectiveEvacuationAreaId = Number(destinationArea.id);
      effectiveEvacuationAreaName = String(destinationArea.name || '').trim() || null;
      effectiveAssignTeam = effectiveEvacuationAreaName ? `${effectiveEvacuationAreaName} Response Team` : '';

      if (!effectiveAssignTeam) {
        const nearestTeam = await resolveNearestRescueTeam(client, Number(current.latitude), Number(current.longitude));
        if (nearestTeam) {
          effectiveAssignTeam = nearestTeam;
        }
      }
    }

    if (nextStatus === 'resolved' && current.report_type === 'rescue') {
      if (!effectiveEvacuationAreaId) {
        const destinationArea = await findNearestAvailableEvacuationArea(
          client,
          Number(current.latitude),
          Number(current.longitude),
          { preferredAreaId: current.evacuation_area_id },
        );

        if (!destinationArea) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: 'No available evacuation area for this resolved rescue case. Please add capacity first.',
            code: 'NO_AVAILABLE_EVACUATION_AREA',
          });
        }

        effectiveEvacuationAreaId = Number(destinationArea.id);
        effectiveEvacuationAreaName = String(destinationArea.name || '').trim() || null;
      }

      effectiveEvacueesReserved = Math.max(1, Number(current.evacuees_reserved || 1));
    }

    if (nextStatus === 'accepted' && !effectiveAssignTeam) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No available rescue team near this incident.' });
    }

    const nextAssignedTeam = nextStatus === 'accepted' ? effectiveAssignTeam : null;
    const nextAdminNotes =
      (nextStatus === 'accepted' || nextStatus === 'in_progress' || nextStatus === 'resolved') && notes
        ? notes
        : null;
    const nextDeclineReason = nextStatus === 'declined' ? declineReason : null;
    const nextDeclineExplanation = nextStatus === 'declined' ? declineExplanation : null;
    const nextDispatchedAt = nextStatus === 'accepted' ? new Date() : null;
    const nextResolvedAt = nextStatus === 'resolved' ? new Date() : null;

    const updateResult = await client.query(
      `UPDATE incident_reports
       SET
         status = $1,
         assigned_team = COALESCE($2, assigned_team),
         admin_notes = COALESCE($3, admin_notes),
         decline_reason = COALESCE($4, decline_reason),
         decline_explanation = COALESCE($5, decline_explanation),
         dispatched_at = CASE WHEN $6::timestamp IS NULL THEN dispatched_at ELSE COALESCE(dispatched_at, $6::timestamp) END,
         resolved_at = COALESCE($7::timestamp, resolved_at),
         evacuation_area_id = COALESCE($10, evacuation_area_id),
         evacuation_area_name = COALESCE($11, evacuation_area_name),
         evacuees_reserved = COALESCE($12, evacuees_reserved),
         updated_at = NOW(),
         updated_by = $8
       WHERE id = $9
       RETURNING *`,
      [
        nextStatus,
        nextAssignedTeam,
        nextAdminNotes,
        nextDeclineReason,
        nextDeclineExplanation,
        nextDispatchedAt,
        nextResolvedAt,
        req.user.userId,
        reportId,
        effectiveEvacuationAreaId,
        effectiveEvacuationAreaName,
        nextStatus === 'resolved' && current.report_type === 'rescue' ? effectiveEvacueesReserved : null,
      ],
    );

    const updated = updateResult.rows[0];

    const actionNote =
      nextStatus === 'accepted'
        ? 'Rescue team dispatched.'
        : nextStatus === 'in_progress'
          ? 'Rescue operation is ongoing.'
          : nextStatus === 'resolved'
            ? 'Rescue completed successfully.'
            : `Report declined: ${declineExplanation}`;

    try {
      await createStatusLog(
        client,
        reportId,
        oldStatus,
        nextStatus,
        req.user.userId,
        actionNote,
        {
          assignTeam: effectiveAssignTeam || null,
          evacuationAreaId: effectiveEvacuationAreaId,
          evacuationAreaName: effectiveEvacuationAreaName,
          notes: notes || null,
          declineReason: declineReason || null,
          declineExplanation: declineExplanation || null,
        },
      );
    } catch (logError) {
      // Keep status transition successful even if audit log insert fails.
      console.error('Failed to write report status log:', logError.message);
    }

    const userMessage =
      nextStatus === 'accepted'
        ? 'Rescue team dispatched.'
        : nextStatus === 'in_progress'
          ? 'Rescue operation is ongoing.'
          : nextStatus === 'resolved'
            ? 'Rescue completed successfully.'
            : `Your report was declined. Reason: ${declineExplanation}`;

    try {
      await createNotification(
        client,
        current.reported_by,
        reportId,
        `Report ${current.report_code || reportId} updated`,
        userMessage,
      );
    } catch (notificationError) {
      // Keep status transition successful even if notification insert fails.
      console.error('Failed to create report notification:', notificationError.message);
    }

    if (nextStatus === 'resolved') {
      await completeBackupResponse(client, reportId, req.user.userId);
    }

    await client.query('COMMIT');
    return res.json(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to update report status:', error.message);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'Failed to update report status. Please retry.',
      ...(error.code ? { code: error.code } : {}),
    });
  } finally {
    client.release();
  }
}

async function getReportLogs(req, res) {
  const reportId = Number(req.params.id);
  if (!Number.isFinite(reportId)) {
    return res.status(400).json({ message: 'Invalid report id.' });
  }

  const reportResult = await pool.query(
    'SELECT id, reported_by FROM incident_reports WHERE id = $1 LIMIT 1',
    [reportId],
  );

  const report = reportResult.rows[0];
  if (!report) {
    return res.status(404).json({ message: 'Report not found.' });
  }

  if (req.user?.role !== 'admin' && req.user?.userId !== report.reported_by) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  const logs = await pool.query(
    `SELECT
      l.id,
      l.report_id,
      l.old_status,
      l.new_status,
      l.action_note,
      l.metadata,
      l.created_at,
      u.id AS changed_by,
      u.username AS changed_by_username
     FROM report_status_logs l
     LEFT JOIN users u ON u.id = l.changed_by
     WHERE l.report_id = $1
     ORDER BY l.created_at ASC`,
    [reportId],
  );

  return res.json(logs.rows);
}

async function getMyNotifications(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Invalid token payload.' });
  }

  const expiredTestAccount = await pool.query(
    `DELETE FROM users
     WHERE id = $1
       AND COALESCE(is_test_account, FALSE) = TRUE
       AND test_account_expires_at IS NOT NULL
       AND test_account_expires_at <= NOW()
     RETURNING id`,
    [userId],
  );
  if (expiredTestAccount.rows.length > 0) {
    return res.status(401).json({
      code: 'TEST_ACCOUNT_EXPIRED',
      message: 'The temporary notification test account has expired.',
    });
  }

  const latitude = Number(req.query?.latitude);
  const longitude = Number(req.query?.longitude);
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  const nearby = hasLocation
    ? resolveNearbyBarangayAtLocation(latitude, longitude, FLOOD_ALERT_BARANGAYS, FLOOD_ALERT_NEARBY_KM)
    : null;

  if (hasLocation) {
    await pool.query(
      `UPDATE users
       SET current_latitude = $1,
           current_longitude = $2,
           current_barangay_name = $3,
           location_updated_at = NOW()
       WHERE id = $4`,
      [latitude, longitude, nearby?.name || null, userId],
    );
  }

  // Generate sensor notifications on the server instead of depending on an
  // admin browser tab, which may be suspended by laptop power-saving modes.
  try {
    await syncFloodSensorAlerts();
  } catch (error) {
    console.error('Unable to synchronize flood sensor alerts.', error);
  }

  const notifications = await pool.query(
    `SELECT n.id, n.user_id, n.report_id, n.title, n.body, n.category, n.severity,
            n.barangay_name, n.source_event_key, n.created_at, n.read_at,
            COALESCE(u.is_test_account, FALSE) AS is_test_account,
            CASE
              WHEN COALESCE(n.category, 'report') <> 'flood_sensor' THEN TRUE
              ELSE LOWER(COALESCE(n.barangay_name, '')) = LOWER(COALESCE(
                $2::varchar,
                u.current_barangay_name,
                u.barangay_name,
                ''
              ))
            END AS matches_current_location
     FROM user_notifications n
     JOIN users u ON u.id = n.user_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC`,
    [userId, nearby?.name || null],
  );

  return res.json(notifications.rows);
}

async function markAllNotificationsRead(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Invalid token payload.' });
  }

  const result = await pool.query(
    `UPDATE user_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND read_at IS NULL
     RETURNING id`,
    [userId],
  );
  return res.json({ updated: result.rowCount });
}

async function markNotificationRead(req, res) {
  const userId = req.user?.userId;
  const notificationId = Number(req.params.id);
  if (!userId || !Number.isInteger(notificationId)) {
    return res.status(400).json({ message: 'Invalid notification.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE user_notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id, read_at, category, source_event_key`,
      [notificationId, userId],
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Notification not found.' });
    }

    let accountDeleted = false;
    if (result.rows[0].category === 'flood_sensor') {
      if (result.rows[0].source_event_key) {
        await client.query(
          `UPDATE user_notifications
           SET read_at = COALESCE(read_at, NOW())
           WHERE user_id = $1
             AND category = 'flood_sensor'
             AND source_event_key = $2`,
          [userId, result.rows[0].source_event_key],
        );
      }
      const deleted = await client.query(
        `DELETE FROM users
         WHERE id = $1 AND COALESCE(is_test_account, FALSE) = TRUE
         RETURNING id`,
        [userId],
      );
      accountDeleted = deleted.rows.length > 0;
    }

    await client.query('COMMIT');
    return res.json({ ...result.rows[0], accountDeleted });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createReport,
  getMyReports,
  getReports,
  getReportImage,
  getReportHistory,
  updateReportStatus,
  getReportLogs,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
};
