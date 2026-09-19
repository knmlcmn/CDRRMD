const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');

function requireRole(req, role) {
  if (req.user?.role !== role) {
    throw httpError(403, `${role === 'admin' ? 'Admin' : 'CDRRMD Rescuer'} access required.`);
  }
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

async function listAccounts(req, res) {
  requireRole(req, 'admin');
  const { rows } = await pool.query(
    `SELECT u.id,
            CONCAT('RSC-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0')) AS rescuer_id,
            u.username, u.email, u.first_name, u.last_name, u.address, u.contact_number,
            u.created_at, u.last_login,
            (COALESCE(u.is_active, FALSE) AND u.last_seen_at >= NOW() - INTERVAL '45 seconds') AS is_online,
            NOT EXISTS (
              SELECT 1 FROM backup_requests br
              WHERE br.assigned_rescuer_id = u.id AND br.arrived_at IS NULL
            ) AS is_available
     FROM users u
     WHERE u.role = 'rescuer' AND COALESCE(u.is_archived, FALSE) = FALSE
     ORDER BY LOWER(u.last_name) NULLS LAST, LOWER(u.first_name) NULLS LAST, u.id`,
  );
  return res.json(rows);
}

async function createAccount(req, res) {
  requireRole(req, 'admin');
  const account = normalizeAccount(req.body);
  if (!account.username || !account.email.includes('@') || account.password.length < 6) {
    throw httpError(400, 'Username, a valid email, and a password of at least 6 characters are required.');
  }
  const duplicate = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2) LIMIT 1',
    [account.email, account.username],
  );
  if (duplicate.rows[0]) throw httpError(409, 'Email or username is already in use.');

  const passwordHash = await bcrypt.hash(account.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, first_name, last_name, address, contact_number, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'rescuer')
     RETURNING id,
       CONCAT('RSC-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS rescuer_id,
       username, email, first_name, last_name, address, contact_number, created_at`,
    [account.username, account.email, account.firstName, account.lastName, account.address, account.contactNumber, passwordHash],
  );
  return res.status(201).json(rows[0]);
}

async function updateAccount(req, res) {
  requireRole(req, 'admin');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescuer ID.');
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
  const passwordHash = account.password ? await bcrypt.hash(account.password, 10) : null;
  const { rows } = await pool.query(
    `UPDATE users SET username = $1, email = $2, first_name = $3, last_name = $4,
       address = $5, contact_number = $6, password_hash = COALESCE($7, password_hash)
     WHERE id = $8 AND role = 'rescuer' AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id,
       CONCAT('RSC-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS rescuer_id,
       username, email, first_name, last_name, address, contact_number, created_at`,
    [account.username, account.email, account.firstName, account.lastName, account.address, account.contactNumber, passwordHash, id],
  );
  if (!rows[0]) throw httpError(404, 'CDRRMD Rescuer account not found.');
  return res.json(rows[0]);
}

async function archiveAccount(req, res) {
  requireRole(req, 'admin');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescuer ID.');
  const active = await pool.query(
    'SELECT id FROM backup_requests WHERE assigned_rescuer_id = $1 AND arrived_at IS NULL LIMIT 1',
    [id],
  );
  if (active.rows[0]) throw httpError(409, 'This rescuer still has an active incident assignment.');
  const { rows } = await pool.query(
    `UPDATE users SET is_archived = TRUE, archived_at = NOW(), archived_by = $2, is_active = FALSE
     WHERE id = $1 AND role = 'rescuer' AND COALESCE(is_archived, FALSE) = FALSE RETURNING id`,
    [id, req.user.userId],
  );
  if (!rows[0]) throw httpError(404, 'CDRRMD Rescuer account not found.');
  return res.status(204).send();
}

async function listMyIncidents(req, res) {
  requireRole(req, 'rescuer');
  const { rows } = await pool.query(
    `SELECT br.id AS backup_request_id, br.created_at AS backup_requested_at,
            br.acknowledged_at, br.assigned_at, br.picked_up_at,
            ir.id, ir.report_code, ir.report_type, ir.incident_type, ir.status,
            ir.location, ir.latitude, ir.longitude, ir.notes,
            ir.assigned_barangay, ir.evacuation_area_id, ir.evacuation_area_name,
            ea.latitude AS evacuation_latitude, ea.longitude AS evacuation_longitude,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            reporter.contact_number AS reporter_contact
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     LEFT JOIN evacuation_areas ea ON ea.id = ir.evacuation_area_id
     LEFT JOIN users reporter ON reporter.id = ir.reported_by
     WHERE br.assigned_rescuer_id = $1
       AND br.arrived_at IS NULL
       AND ir.status IN ('pending', 'accepted', 'in_progress')
     ORDER BY br.assigned_at, br.id`,
    [req.user.userId],
  );
  return res.json(rows);
}

async function updateMyLocation(req, res) {
  requireRole(req, 'rescuer');
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw httpError(400, 'Valid latitude and longitude are required.');
  }
  const { rows } = await pool.query(
    `UPDATE users SET current_latitude = $1, current_longitude = $2,
       location_updated_at = NOW(), last_seen_at = NOW(), is_active = TRUE
     WHERE id = $3 AND role = 'rescuer' AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING location_updated_at`,
    [latitude, longitude, req.user.userId],
  );
  if (!rows[0]) throw httpError(404, 'CDRRMD Rescuer account not found.');
  return res.json(rows[0]);
}

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  listMyIncidents,
  updateMyLocation,
};
