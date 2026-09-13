const authService = require('../services/authService');

async function register(req, res) {
  const response = await authService.register(req.body);
  return res.status(201).json(response);
}

async function login(req, res) {
  const response = await authService.login(req.body);
  return res.json(response);
}

async function logout(req, res) {
  await authService.logout(req.user?.userId);
  return res.json({ ok: true });
}

async function refresh(req, res) {
  const response = await authService.refresh(req.body);
  return res.json(response);
}

async function me(req, res) {
  const response = await authService.getMe(req.user?.userId);
  return res.json(response);
}

async function updateMe(req, res) {
  const response = await authService.updateMe(req.user?.userId, req.body);
  return res.json(response);
}

module.exports = { login, register, logout, refresh, me, updateMe };
