const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { isSupportedBarangay } = require('../services/supportedBarangays');
const { findNearestAvailableEvacuationArea } = require('../services/evacuationRoutingService');

function requireRole(req, role) {
  if (req.user?.role !== role) {
    throw httpError(403, `${role === 'admin' ? 'Admin' : 'CDRRMD Rescuer'} access required.`);
  }
}

function responseScope(req) {
  if (req.user?.role === 'rescuer') return { dispatchType: 'cddrmd_backup', barangayName: null };
  if (req.user?.role === 'barangay_rescuer') {
    const barangayName = String(req.user?.barangayName || '').trim();
    if (!barangayName) throw httpError(403, 'No barangay assigned to this responder account.');
    return { dispatchType: 'barangay_responder', barangayName };
  }
  throw httpError(403, 'Rescuer access required.');
}

function normalizeAccount(payload) {
  return {
    username: String(payload?.username || '').trim(),
    email: String(payload?.email || '').trim().toLowerCase(),
    password: String(payload?.password || ''),
    firstName: String(payload?.firstName || '').trim() || null,
    lastName: String(payload?.lastName || '').trim() || null,
    address: String(payload?.address || '').trim() || null,
    contactNumber: String(payload?.contactNumber || '').trim() || null,
  };
}

function normalizeManagedRole(value) {
  return value === 'barangay_rescuer' ? 'barangay_rescuer' : 'rescuer';
}

function accountPrefix(role) {
  return role === 'barangay_rescuer' ? 'BRS' : 'RSC';
}

function distanceMeters(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const startLatitude = toRadians(fromLatitude);
  const endLatitude = toRadians(toLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function listAccounts(req, res) {
  if (!['admin', 'barangay', 'rescuer', 'barangay_rescuer'].includes(req.user?.role)) {
    throw httpError(403, 'Rescuer access required.');
  }
  const listedRole = req.user.role === 'admin'
    ? normalizeManagedRole(req.query?.role)
    : ['barangay', 'barangay_rescuer'].includes(req.user.role) ? 'barangay_rescuer' : 'rescuer';
  const prefix = accountPrefix(listedRole);
  const barangayScope = ['barangay', 'barangay_rescuer'].includes(req.user.role)
    ? String(req.user.barangayName || '').trim()
    : null;
  if (['barangay', 'barangay_rescuer'].includes(req.user.role) && !barangayScope) {
    throw httpError(403, 'No barangay is assigned to this account.');
  }
  const { rows } = await pool.query(
    `SELECT u.id,
            CONCAT($2::text, '-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0')) AS rescuer_id,
            u.username, u.email, u.first_name, u.last_name, u.address, u.contact_number, u.barangay_name,
            u.current_latitude, u.current_longitude, u.location_updated_at,
            u.created_at, u.last_login,
            (COALESCE(u.is_active, FALSE) AND u.last_seen_at >= NOW() - INTERVAL '45 seconds') AS is_online,
            (u.id = $1) AS is_self,
            NOT EXISTS (
              SELECT 1 FROM backup_requests br
              WHERE br.assigned_rescuer_id = u.id AND br.arrived_at IS NULL AND br.declined_at IS NULL
            ) AS is_available
     FROM users u
     WHERE u.role = $3 AND COALESCE(u.is_archived, FALSE) = FALSE
       AND ($4::text IS NULL OR LOWER(u.barangay_name) = LOWER($4))
     ORDER BY (u.id = $1) DESC, LOWER(u.last_name) NULLS LAST, LOWER(u.first_name) NULLS LAST, u.id`,
    [req.user.userId, prefix, listedRole, barangayScope],
  );
  return res.json(rows);
}

async function listArchivedAccounts(req, res) {
  requireRole(req, 'admin');
  const listedRole = normalizeManagedRole(req.query?.role);
  const prefix = accountPrefix(listedRole);
  const { rows } = await pool.query(
    `SELECT u.id,
            CONCAT($1::text, '-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0')) AS rescuer_id,
            u.username, u.email, u.first_name, u.last_name, u.address, u.contact_number, u.barangay_name,
            u.created_at, u.last_login, u.archived_at
     FROM users u
     WHERE u.role = $2 AND COALESCE(u.is_archived, FALSE) = TRUE
     ORDER BY u.archived_at DESC, u.id DESC`,
    [prefix, listedRole],
  );
  return res.json(rows);
}

async function createAccount(req, res) {
  if (!['admin', 'barangay'].includes(req.user?.role)) {
    throw httpError(403, 'Admin or barangay access required.');
  }
  const account = normalizeAccount(req.body);
  const role = req.user.role === 'barangay'
    ? 'barangay_rescuer'
    : normalizeManagedRole(req.body?.role);
  const barangayName = role === 'barangay_rescuer'
    ? String(req.user.role === 'barangay' ? req.user.barangayName : req.body?.barangayName || '').trim()
    : null;
  if (!account.username || !account.email.includes('@') || account.password.length < 6) {
    throw httpError(400, 'Username, a valid email, and a password of at least 6 characters are required.');
  }
  if (role === 'barangay_rescuer' && !isSupportedBarangay(barangayName)) {
    throw httpError(400, 'Select a valid barangay for this rescuer.');
  }
  const duplicate = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2) LIMIT 1',
    [account.email, account.username],
  );
  if (duplicate.rows[0]) throw httpError(409, 'Email or username is already in use.');

  const passwordHash = await bcrypt.hash(account.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, first_name, last_name, address, contact_number, password_hash, role, barangay_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id,
       CONCAT(CASE WHEN role = 'barangay_rescuer' THEN 'BRS' ELSE 'RSC' END, '-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS rescuer_id,
       username, email, first_name, last_name, address, contact_number, barangay_name, created_at`,
    [account.username, account.email, account.firstName, account.lastName, account.address, account.contactNumber, passwordHash, role, barangayName],
  );
  return res.status(201).json(rows[0]);
}

async function updateAccount(req, res) {
  requireRole(req, 'admin');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescuer ID.');
  const existingResult = await pool.query(
    `SELECT role, barangay_name FROM users
     WHERE id = $1 AND role IN ('rescuer', 'barangay_rescuer') AND COALESCE(is_archived, FALSE) = FALSE
     LIMIT 1`,
    [id],
  );
  const existing = existingResult.rows[0];
  if (!existing) throw httpError(404, 'Rescuer account not found.');
  const account = normalizeAccount(req.body);
  if (!account.username || !account.email.includes('@')) {
    throw httpError(400, 'Username and a valid email are required.');
  }
  const duplicate = await pool.query(
    'SELECT id FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)) AND id <> $3 LIMIT 1',
    [account.email, account.username, id],
  );
  if (duplicate.rows[0]) throw httpError(409, 'Email or username is already in use.');
  if (account.password && account.password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  const barangayName = existing.role === 'barangay_rescuer'
    ? String(req.body?.barangayName || existing.barangay_name || '').trim()
    : null;
  if (existing.role === 'barangay_rescuer' && !isSupportedBarangay(barangayName)) {
    throw httpError(400, 'Select a valid barangay for this rescuer.');
  }
  const passwordHash = account.password ? await bcrypt.hash(account.password, 10) : null;
  const { rows } = await pool.query(
    `UPDATE users SET username = $1, email = $2, first_name = $3, last_name = $4,
       address = $5, contact_number = $6, password_hash = COALESCE($7, password_hash), barangay_name = $8
     WHERE id = $9 AND role = $10 AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id,
       CONCAT(CASE WHEN role = 'barangay_rescuer' THEN 'BRS' ELSE 'RSC' END, '-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS rescuer_id,
       username, email, first_name, last_name, address, contact_number, barangay_name, created_at`,
    [account.username, account.email, account.firstName, account.lastName, account.address, account.contactNumber, passwordHash, barangayName, id, existing.role],
  );
  if (!rows[0]) throw httpError(404, 'Rescuer account not found.');
  return res.json(rows[0]);
}

async function archiveAccount(req, res) {
  requireRole(req, 'admin');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescuer ID.');
  const active = await pool.query(
    'SELECT id FROM backup_requests WHERE assigned_rescuer_id = $1 AND arrived_at IS NULL AND declined_at IS NULL LIMIT 1',
    [id],
  );
  if (active.rows[0]) throw httpError(409, 'This rescuer still has an active incident assignment.');
  const { rows } = await pool.query(
    `UPDATE users SET is_archived = TRUE, archived_at = NOW(), archived_by = $2, is_active = FALSE
     WHERE id = $1 AND role IN ('rescuer', 'barangay_rescuer') AND COALESCE(is_archived, FALSE) = FALSE RETURNING id`,
    [id, req.user.userId],
  );
  if (!rows[0]) throw httpError(404, 'Rescuer account not found.');
  return res.status(204).send();
}

async function restoreAccount(req, res) {
  requireRole(req, 'admin');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescuer ID.');
  const { rows } = await pool.query(
    `UPDATE users SET is_archived = FALSE, archived_at = NULL, archived_by = NULL
     WHERE id = $1 AND role IN ('rescuer', 'barangay_rescuer') AND COALESCE(is_archived, FALSE) = TRUE
     RETURNING id`,
    [id],
  );
  if (!rows[0]) throw httpError(404, 'Archived rescuer account not found.');
  return res.json(rows[0]);
}

async function permanentlyDeleteAccount(req, res) {
  requireRole(req, 'admin');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescuer ID.');
  const { rows } = await pool.query(
    `DELETE FROM users
     WHERE id = $1 AND role IN ('rescuer', 'barangay_rescuer') AND COALESCE(is_archived, FALSE) = TRUE
     RETURNING id`,
    [id],
  );
  if (!rows[0]) throw httpError(404, 'Archived rescuer account not found.');
  return res.status(204).send();
}

async function listMyIncidents(req, res) {
  const scope = responseScope(req);
  const { rows } = await pool.query(
    `SELECT br.id AS backup_request_id, br.created_at AS backup_requested_at,
            br.acknowledged_at, br.assigned_at, br.responder_acknowledged_at, br.picked_up_at,
            ir.id, ir.report_code, ir.report_type, ir.incident_type, ir.status,
            ir.location,
            CASE WHEN reporter.location_updated_at >= NOW() - INTERVAL '5 minutes'
                AND reporter.current_latitude IS NOT NULL AND reporter.current_longitude IS NOT NULL
              THEN reporter.current_latitude ELSE ir.latitude END AS latitude,
            CASE WHEN reporter.location_updated_at >= NOW() - INTERVAL '5 minutes'
                AND reporter.current_latitude IS NOT NULL AND reporter.current_longitude IS NOT NULL
              THEN reporter.current_longitude ELSE ir.longitude END AS longitude,
            reporter.location_updated_at AS resident_location_updated_at,
            ir.notes, ir.estimated_people, ir.evacuees_reserved,
            ir.assigned_barangay, ir.evacuation_area_id, ir.evacuation_area_name,
            ea.latitude AS evacuation_latitude, ea.longitude AS evacuation_longitude,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            reporter.contact_number AS reporter_contact
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     LEFT JOIN evacuation_areas ea ON ea.id = ir.evacuation_area_id
     LEFT JOIN users reporter ON reporter.id = ir.reported_by
     WHERE br.assigned_rescuer_id = $1
       AND br.dispatch_type = $2
       AND ($3::text IS NULL OR LOWER(ir.assigned_barangay) = LOWER($3))
       AND br.arrived_at IS NULL
       AND ir.status IN ('pending', 'accepted', 'in_progress')
     ORDER BY br.assigned_at, br.id`,
    [req.user.userId, scope.dispatchType, scope.barangayName],
  );
  return res.json(rows);
}

async function listMyIncidentHistory(req, res) {
  const scope = responseScope(req);
  const { rows } = await pool.query(
    `SELECT br.id AS backup_request_id, br.created_at AS backup_requested_at,
            br.assigned_at, br.picked_up_at, br.arrived_at,
            ir.id, ir.report_code, ir.incident_type, ir.status, ir.location,
            ir.assigned_barangay, ir.evacuation_area_name,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     LEFT JOIN users reporter ON reporter.id = ir.reported_by
     WHERE br.assigned_rescuer_id = $1
       AND br.dispatch_type = $2
       AND ($3::text IS NULL OR LOWER(ir.assigned_barangay) = LOWER($3))
       AND br.arrived_at IS NOT NULL
     ORDER BY br.arrived_at DESC, br.id DESC
     LIMIT 100`,
    [req.user.userId, scope.dispatchType, scope.barangayName],
  );
  return res.json(rows);
}

async function listFloodReports(req, res) {
  const scope = responseScope(req);
  const { rows } = await pool.query(
    `SELECT ir.id, ir.report_code, ir.location, ir.water_level, ir.status,
            ir.assigned_barangay, ir.created_at, ir.updated_at,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            reporter.contact_number
     FROM incident_reports ir
     LEFT JOIN users reporter ON reporter.id = ir.reported_by
     WHERE ir.report_type = 'flood'
       AND ($1::text IS NULL OR LOWER(ir.assigned_barangay) = LOWER($1))
     ORDER BY ir.created_at DESC
     LIMIT 200`,
    [scope.barangayName],
  );
  return res.json(rows);
}

async function updateMyLocation(req, res) {
  const scope = responseScope(req);
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw httpError(400, 'Valid latitude and longitude are required.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locationResult = await client.query(
      `UPDATE users SET current_latitude = $1, current_longitude = $2,
         location_updated_at = NOW(), last_seen_at = NOW(), is_active = TRUE
       WHERE id = $3 AND role IN ('rescuer', 'barangay_rescuer') AND COALESCE(is_archived, FALSE) = FALSE
       RETURNING location_updated_at`,
      [latitude, longitude, req.user.userId],
    );
    if (!locationResult.rows[0]) throw httpError(404, 'Responder account not found.');

    const assignmentResult = await client.query(
      `SELECT br.id AS backup_request_id, br.report_id, br.responder_acknowledged_at, br.picked_up_at,
              ir.status, ir.reported_by, ir.report_code, ir.evacuees_reserved,
              ir.evacuation_area_id, ir.evacuation_area_name,
              CASE WHEN reporter.location_updated_at >= NOW() - INTERVAL '5 minutes'
                  AND reporter.current_latitude IS NOT NULL AND reporter.current_longitude IS NOT NULL
                THEN reporter.current_latitude ELSE ir.latitude END AS incident_latitude,
              CASE WHEN reporter.location_updated_at >= NOW() - INTERVAL '5 minutes'
                  AND reporter.current_latitude IS NOT NULL AND reporter.current_longitude IS NOT NULL
                THEN reporter.current_longitude ELSE ir.longitude END AS incident_longitude,
              ea.latitude AS evacuation_latitude, ea.longitude AS evacuation_longitude
       FROM backup_requests br
       JOIN incident_reports ir ON ir.id = br.report_id
       LEFT JOIN users reporter ON reporter.id = ir.reported_by
       LEFT JOIN evacuation_areas ea ON ea.id = ir.evacuation_area_id
       WHERE br.assigned_rescuer_id = $1
         AND br.dispatch_type = $2
         AND ($3::text IS NULL OR LOWER(ir.assigned_barangay) = LOWER($3))
         AND br.arrived_at IS NULL AND br.declined_at IS NULL
         AND ir.status IN ('pending', 'accepted', 'in_progress')
       ORDER BY br.assigned_at, br.id
       LIMIT 1
       FOR UPDATE OF br, ir`,
      [req.user.userId, scope.dispatchType, scope.barangayName],
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment || !assignment.responder_acknowledged_at) {
      await client.query('COMMIT');
      return res.json({ ...locationResult.rows[0], pickupConfirmed: false });
    }

    const incidentCoordinatesAvailable = assignment.incident_latitude != null && assignment.incident_longitude != null;
    const incidentDistanceMeters = incidentCoordinatesAvailable
      ? distanceMeters(latitude, longitude, Number(assignment.incident_latitude), Number(assignment.incident_longitude))
      : Number.POSITIVE_INFINITY;
    let pickupConfirmed = false;

    // The server performs the transition atomically with the GPS update. A
    // browser accuracy estimate must not block two markers that have met.
    if (!assignment.picked_up_at && incidentDistanceMeters <= 50) {
      const destinationArea = await findNearestAvailableEvacuationArea(
        client,
        Number(assignment.incident_latitude),
        Number(assignment.incident_longitude),
        {
          requiredSlots: Math.max(1, Number(assignment.evacuees_reserved || 1)),
          excludeReportId: assignment.report_id,
        },
      );
      if (!destinationArea) {
        throw httpError(409, 'No reachable evacuation center currently has enough available capacity.');
      }
      assignment.evacuation_area_id = Number(destinationArea.id);
      assignment.evacuation_area_name = destinationArea.name;
      assignment.evacuation_latitude = Number(destinationArea.latitude);
      assignment.evacuation_longitude = Number(destinationArea.longitude);
      await client.query(
        `UPDATE incident_reports
         SET evacuation_area_id = $1, evacuation_area_name = $2,
             status = 'in_progress', updated_at = NOW(), updated_by = $3
         WHERE id = $4`,
        [destinationArea.id, destinationArea.name, req.user.userId, assignment.report_id],
      );
      const pickupResult = await client.query(
        `UPDATE backup_requests SET picked_up_at = COALESCE(picked_up_at, NOW())
         WHERE id = $1 RETURNING picked_up_at`,
        [assignment.backup_request_id],
      );
      assignment.picked_up_at = pickupResult.rows[0].picked_up_at;
      await client.query(
        `INSERT INTO report_status_logs (report_id, old_status, new_status, changed_by, action_note, metadata)
         VALUES ($1, $2, 'in_progress', $3, $4, $5::jsonb)`,
        [assignment.report_id, assignment.status, req.user.userId, `Responder reached the resident. Routing to ${assignment.evacuation_area_name}.`, JSON.stringify({ backupRequestId: assignment.backup_request_id, evacuationAreaId: assignment.evacuation_area_id, pickedUp: true, automatic: true })],
      );
      await client.query(
        `INSERT INTO user_notifications (user_id, report_id, title, body)
         VALUES ($1, $2, $3, $4)`,
        [assignment.reported_by, assignment.report_id, `Report ${assignment.report_code || assignment.report_id} updated`, `Your responder reached you. The route now leads to ${assignment.evacuation_area_name}.`],
      );
      pickupConfirmed = true;
    }

    const destinationLatitude = Number(assignment.picked_up_at
      ? assignment.evacuation_latitude
      : assignment.incident_latitude);
    const destinationLongitude = Number(assignment.picked_up_at
      ? assignment.evacuation_longitude
      : assignment.incident_longitude);
    const currentDistanceMeters = Number.isFinite(destinationLatitude) && Number.isFinite(destinationLongitude)
      ? distanceMeters(latitude, longitude, destinationLatitude, destinationLongitude)
      : null;

    await client.query('COMMIT');
    return res.json({
      ...locationResult.rows[0],
      backupRequestId: assignment.backup_request_id,
      distanceMeters: currentDistanceMeters == null ? null : Math.round(currentDistanceMeters),
      pickupConfirmed,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listAccounts,
  listArchivedAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  restoreAccount,
  permanentlyDeleteAccount,
  listMyIncidents,
  listMyIncidentHistory,
  listFloodReports,
  updateMyLocation,
};
