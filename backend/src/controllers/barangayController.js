const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { httpError } = require('../utils/httpError');

const SUPPORTED_BARANGAYS = new Set([
  'palingon',
  'lingga',
  'sampiruhan',
  'looc',
  'uwisan',
  'parian',
]);

function normalizeBarangayName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^(brgy\.?|barangay)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSupportedBarangayName(value) {
  return SUPPORTED_BARANGAYS.has(normalizeBarangayName(value));
}

function ensureAdmin(req, res) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required.' });
    return false;
  }
  return true;
}

function ensureBarangayOrAdmin(req, res) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'barangay') {
    res.status(403).json({ message: 'Barangay or admin access required.' });
    return false;
  }
  return true;
}

// ── Admin: manage barangay accounts ──────────────────────────────────────

async function listAccounts(req, res) {
  if (!ensureAdmin(req, res)) return;
  const rows = await userModel.listBarangayAccounts();
  return res.json(rows);
}

async function heartbeatPresence(req, res) {
  if (req.user?.role !== 'barangay') {
    return res.status(403).json({ message: 'Barangay access required.' });
  }
  const presence = await userModel.touchBarangayPresence(req.user.userId);
  if (!presence) {
    return res.status(404).json({ message: 'Barangay account not found.' });
  }
  return res.json({ online: true, lastSeenAt: presence.last_seen_at });
}

async function markPresenceOffline(req, res) {
  if (req.user?.role !== 'barangay') {
    return res.status(403).json({ message: 'Barangay access required.' });
  }
  await userModel.markBarangayOffline(req.user.userId);
  return res.json({ online: false });
}

async function listArchivedAccounts(req, res) {
  if (!ensureAdmin(req, res)) return;
  const rows = await userModel.listArchivedBarangayAccounts();
  return res.json(rows);
}

async function createAccount(req, res) {
  if (!ensureAdmin(req, res)) return;
  const { username, email, password, firstName, lastName, address, contactNumber, barangayName } = req.body || {};

  if (!username || !email || !password || !barangayName) {
    throw httpError(400, 'username, email, password and barangayName are required.');
  }
  if (!isSupportedBarangayName(barangayName)) {
    throw httpError(400, 'Barangay must be one of Palingon, Lingga, Sampiruhan, Looc, Uwisan, or Parian.');
  }

  const dup = await userModel.findDuplicateBarangay(email, username);
  if (dup) throw httpError(409, 'Email or username already in use.');

  const passwordHash = await bcrypt.hash(String(password), 10);
  const account = await userModel.createBarangayAccount({
    username: String(username).trim(),
    email: String(email).trim().toLowerCase(),
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    address: String(address || '').trim() || null,
    contactNumber: String(contactNumber || '').trim() || null,
    barangayName: String(barangayName).trim(),
    passwordHash,
  });
  return res.status(201).json(account);
}

async function updateAccount(req, res) {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw httpError(400, 'Invalid id.');

  const existing = await userModel.findBarangayById(id);
  if (!existing) throw httpError(404, 'Barangay account not found.');

  const { username, email, password, firstName, lastName, address, contactNumber, barangayName } = req.body || {};
  if (!username || !email || !barangayName) throw httpError(400, 'username, email and barangayName are required.');
  if (!isSupportedBarangayName(barangayName)) {
    throw httpError(400, 'Barangay must be one of Palingon, Lingga, Sampiruhan, Looc, Uwisan, or Parian.');
  }

  const dup = await userModel.findDuplicateBarangay(email, username, id);
  if (dup) throw httpError(409, 'Email or username already in use.');

  const passwordHash = password ? await bcrypt.hash(String(password), 10) : null;
  const updated = await userModel.updateBarangayAccount({
    id,
    username: String(username).trim(),
    email: String(email).trim().toLowerCase(),
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    address: String(address || '').trim() || null,
    contactNumber: String(contactNumber || '').trim() || null,
    barangayName: String(barangayName).trim(),
    passwordHash,
  });
  return res.json(updated);
}

async function archiveAccount(req, res) {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw httpError(400, 'Invalid id.');
  const result = await userModel.archiveBarangayById(id, req.user?.userId);
  if (!result) throw httpError(404, 'Barangay account not found or already archived.');
  return res.json({ ok: true });
}

async function restoreAccount(req, res) {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw httpError(400, 'Invalid id.');
  const result = await userModel.restoreBarangayById(id);
  if (!result) throw httpError(404, 'Archived barangay account not found.');
  return res.json({ ok: true });
}

async function permanentlyDeleteAccount(req, res) {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw httpError(400, 'Invalid id.');
  const result = await userModel.permanentlyDeleteBarangayById(id);
  if (!result) throw httpError(404, 'Archived barangay account not found.');
  return res.status(204).send();
}

// ── Barangay: read own jurisdiction data ─────────────────────────────────

async function getMyReports(req, res) {
  if (!ensureBarangayOrAdmin(req, res)) return;

  let barangayName;
  if (req.user?.role === 'admin') {
    barangayName = req.query.barangay;
    if (!barangayName) return res.json([]);
  } else {
    barangayName = req.user?.barangayName;
  }

  if (!barangayName) {
    return res.status(400).json({ message: 'No barangay assigned to this account.' });
  }

  try {
    // Jurisdiction is fixed from the resident's GPS coordinates at submission.
    // Do not infer it from an evacuation center, text, or a nearby centroid.
    const rows = await userModel.listReportsByAssignedBarangay(barangayName);
    return res.json(rows);
  } catch (error) {
    console.error('[getMyReports] Failed for barangay:', barangayName, error);
    return res.status(500).json({ message: 'Failed to load reports. Please try again.' });
  }
}

async function getMyProfile(req, res) {
  const userId = req.user?.userId;
  const pool = require('../config/db');
  const result = await pool.query(
    `SELECT id, username, email, first_name, last_name, address, contact_number,
            role, barangay_name,
            (COALESCE(is_active, FALSE) = TRUE AND last_seen_at >= NOW() - INTERVAL '45 seconds') AS is_active,
            last_login, created_at
     FROM users WHERE id = $1 AND COALESCE(is_archived, FALSE) = FALSE LIMIT 1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user) { res.status(404).json({ message: 'User not found.' }); return; }
  return res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    address: user.address,
    contactNumber: user.contact_number,
    role: user.role,
    barangayName: user.barangay_name,
    isActive: user.is_active,
    lastLogin: user.last_login,
    createdAt: user.created_at,
  });
}

async function updateMyProfile(req, res) {
  if (!ensureBarangayOrAdmin(req, res)) return;
  const userId = req.user?.userId;
  const { firstName, lastName, email, address, contactNumber } = req.body || {};
  if (!email) throw httpError(400, 'Email is required.');

  const dup = await userModel.findDuplicateEmailForUser(String(email).trim().toLowerCase(), userId);
  if (dup) throw httpError(409, 'Email already in use.');

  const updated = await userModel.updateMyProfile(userId, {
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    email: String(email).trim().toLowerCase(),
    address: String(address || '').trim() || null,
    contactNumber: String(contactNumber || '').trim() || null,
  });
  return res.json({
    id: updated.id,
    username: updated.username,
    email: updated.email,
    firstName: updated.first_name,
    lastName: updated.last_name,
    address: updated.address,
    contactNumber: updated.contact_number,
    role: updated.role,
  });
}

module.exports = {
  heartbeatPresence,
  markPresenceOffline,
  listAccounts,
  listArchivedAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  restoreAccount,
  permanentlyDeleteAccount,
  getMyReports,
  getMyProfile,
  updateMyProfile,
};
