const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const { httpError } = require('../utils/httpError');

// All admin-management endpoints are gated here.
function ensureAdmin(user) {
  if (user?.role !== 'admin') {
    throw httpError(403, 'Admin access required.');
  }
}

function normalizeAdminPayload(payload) {
  // Normalize optional inputs once so downstream checks stay predictable.
  const normalizedEmail = String(payload?.email || '').trim().toLowerCase();
  const finalUsername = String(payload?.username || '').trim() || normalizedEmail.split('@')[0];

  return {
    username: finalUsername,
    email: normalizedEmail,
    firstName: String(payload?.firstName || '').trim() || null,
    lastName: String(payload?.lastName || '').trim() || null,
    address: String(payload?.address || '').trim() || null,
    contactNumber: String(payload?.contactNumber || '').trim() || null,
    password: String(payload?.password || '').trim(),
  };
}

async function listAdmins(actor) {
  ensureAdmin(actor);
  return userModel.listAdmins();
}

async function listUsers(actor) {
  ensureAdmin(actor);
  return userModel.listUsers();
}

async function listArchivedUsers(actor) {
  ensureAdmin(actor);
  return userModel.listArchivedUsers();
}

async function listArchivedAdmins(actor) {
  ensureAdmin(actor);
  return userModel.listArchivedAdmins();
}

async function createAdmin(actor, payload) {
  ensureAdmin(actor);

  const next = normalizeAdminPayload(payload);
  if (!next.email || !next.email.includes('@')) {
    throw httpError(400, 'Valid email is required.');
  }
  if (next.password.length < 6) {
    throw httpError(400, 'Password must be at least 6 characters.');
  }

  const duplicate = await userModel.findDuplicateAdmin(next.email, next.username);
  if (duplicate) {
    throw httpError(409, 'Admin with the same email or username already exists.');
  }

  const passwordHash = await bcrypt.hash(next.password, 10);
  return userModel.createAdmin({ ...next, passwordHash });
}

async function createUser(actor, payload) {
  ensureAdmin(actor);

  const next = normalizeAdminPayload(payload);
  if (!next.email || !next.email.includes('@')) {
    throw httpError(400, 'Valid email is required.');
  }
  if (next.password.length < 6) {
    throw httpError(400, 'Password must be at least 6 characters.');
  }

  const duplicate = await userModel.findDuplicateUser(next.email, next.username);
  if (duplicate) {
    throw httpError(409, 'User with the same email or username already exists.');
  }

  const passwordHash = await bcrypt.hash(next.password, 10);
  return userModel.createUserByAdmin({ ...next, passwordHash });
}

async function updateAdmin(actor, adminId, payload) {
  ensureAdmin(actor);

  const id = Number(adminId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid admin id.');
  }

  if (actor?.userId !== id) {
    throw httpError(403, 'You can only edit your own admin account.');
  }

  const existing = await userModel.findAdminById(id);
  if (!existing) {
    throw httpError(404, 'Admin not found.');
  }

  const next = normalizeAdminPayload(payload);
  if (!next.email || !next.email.includes('@')) {
    throw httpError(400, 'Valid email is required.');
  }
  if (!next.username) {
    throw httpError(400, 'Username is required.');
  }

  const duplicate = await userModel.findDuplicateAdmin(next.email, next.username, id);
  if (duplicate) {
    throw httpError(409, 'Email or username already exists.');
  }

  let passwordHash = null;
  if (next.password.length > 0) {
    if (next.password.length < 6) {
      throw httpError(400, 'Password must be at least 6 characters.');
    }
    passwordHash = await bcrypt.hash(next.password, 10);
  }

  return userModel.updateAdmin({
    id,
    username: next.username,
    email: next.email,
    firstName: next.firstName,
    lastName: next.lastName,
    address: next.address,
    contactNumber: next.contactNumber,
    passwordHash,
  });
}

async function deleteAdmin(actor, adminId) {
  ensureAdmin(actor);

  const id = Number(adminId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid admin id.');
  }

  if (actor?.userId !== id) {
    throw httpError(403, 'You can only archive your own admin account.');
  }

  const removed = await userModel.archiveAdminById(id, actor?.userId || null);
  if (!removed) {
    throw httpError(404, 'Admin not found.');
  }
}

async function restoreAdmin(actor, adminId) {
  ensureAdmin(actor);

  const id = Number(adminId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid admin id.');
  }

  const restored = await userModel.restoreAdminById(id);
  if (!restored) {
    throw httpError(404, 'Archived admin not found.');
  }

  return restored;
}

async function permanentlyDeleteAdmin(actor, adminId) {
  ensureAdmin(actor);

  const id = Number(adminId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid admin id.');
  }

  if (actor?.userId === id) {
    throw httpError(400, 'You cannot permanently delete your own account.');
  }

  const removed = await userModel.permanentlyDeleteAdminById(id);
  if (!removed) {
    throw httpError(404, 'Archived admin not found.');
  }
}

async function updateUser(actor, userId, payload) {
  ensureAdmin(actor);

  const id = Number(userId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid user id.');
  }

  if (actor?.userId === id) {
    throw httpError(400, 'Use account settings to update your own admin account.');
  }

  const existing = await userModel.findUserByIdForAdmin(id);
  if (!existing) {
    throw httpError(404, 'User account not found.');
  }

  const next = normalizeAdminPayload(payload);
  if (!next.email || !next.email.includes('@')) {
    throw httpError(400, 'Valid email is required.');
  }
  if (!next.username) {
    throw httpError(400, 'Username is required.');
  }

  const duplicate = await userModel.findDuplicateUser(next.email, next.username, id);
  if (duplicate) {
    throw httpError(409, 'Email or username already exists.');
  }

  let passwordHash = null;
  if (next.password.length > 0) {
    if (next.password.length < 6) {
      throw httpError(400, 'Password must be at least 6 characters.');
    }
    passwordHash = await bcrypt.hash(next.password, 10);
  }

  return userModel.updateUserById({
    id,
    username: next.username,
    email: next.email,
    firstName: next.firstName,
    lastName: next.lastName,
    address: next.address,
    contactNumber: next.contactNumber,
    passwordHash,
  });
}

async function deleteUser(actor, userId) {
  ensureAdmin(actor);

  const id = Number(userId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid user id.');
  }

  const removed = await userModel.archiveUserById(id, actor?.userId || null);
  if (!removed) {
    throw httpError(404, 'User account not found.');
  }
}

async function restoreUser(actor, userId) {
  ensureAdmin(actor);

  const id = Number(userId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid user id.');
  }

  const restored = await userModel.restoreUserById(id);
  if (!restored) {
    throw httpError(404, 'Archived user account not found.');
  }

  return restored;
}

async function permanentlyDeleteUser(actor, userId) {
  ensureAdmin(actor);

  const id = Number(userId);
  if (!Number.isFinite(id)) {
    throw httpError(400, 'Invalid user id.');
  }

  const removed = await userModel.permanentlyDeleteUserById(id);
  if (!removed) {
    throw httpError(404, 'Archived user account not found.');
  }
}

module.exports = {
  listAdmins,
  listUsers,
  listArchivedAdmins,
  listArchivedUsers,
  createAdmin,
  createUser,
  updateAdmin,
  deleteAdmin,
  restoreAdmin,
  permanentlyDeleteAdmin,
  updateUser,
  deleteUser,
  restoreUser,
  permanentlyDeleteUser,
};
