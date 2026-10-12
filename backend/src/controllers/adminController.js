const adminService = require('../services/adminService');

async function listAdmins(req, res) {
  const rows = await adminService.listAdmins(req.user);
  return res.json(rows);
}

async function listArchivedAdmins(req, res) {
  const rows = await adminService.listArchivedAdmins(req.user);
  return res.json(rows);
}

async function listUsers(req, res) {
  const rows = await adminService.listUsers(req.user);
  return res.json(rows);
}

async function listArchivedUsers(req, res) {
  const rows = await adminService.listArchivedUsers(req.user);
  return res.json(rows);
}

async function createAdmin(req, res) {
  const created = await adminService.createAdmin(req.user, req.body);
  return res.status(201).json(created);
}

async function createUser(req, res) {
  const created = await adminService.createUser(req.user, req.body);
  return res.status(201).json(created);
}

async function updateAdmin(req, res) {
  const updated = await adminService.updateAdmin(req.user, req.params.id, req.body);
  return res.json(updated);
}

async function deleteAdmin(req, res) {
  await adminService.deleteAdmin(req.user, req.params.id);
  return res.status(204).send();
}

async function restoreAdmin(req, res) {
  const restored = await adminService.restoreAdmin(req.user, req.params.id);
  return res.json(restored);
}

async function permanentlyDeleteAdmin(req, res) {
  await adminService.permanentlyDeleteAdmin(req.user, req.params.id);
  return res.status(204).send();
}

async function updateUser(req, res) {
  const updated = await adminService.updateUser(req.user, req.params.id, req.body);
  return res.json(updated);
}

async function deleteUser(req, res) {
  await adminService.deleteUser(req.user, req.params.id);
  return res.status(204).send();
}

async function restoreUser(req, res) {
  const restored = await adminService.restoreUser(req.user, req.params.id);
  return res.json(restored);
}

async function permanentlyDeleteUser(req, res) {
  await adminService.permanentlyDeleteUser(req.user, req.params.id);
  return res.status(204).send();
}

module.exports = {
  listAdmins,
  listArchivedAdmins,
  listArchivedUsers,
  listUsers,
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
