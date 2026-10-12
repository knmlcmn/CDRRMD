const familyService = require('../services/familyService');

async function list(req, res) {
  return res.json(await familyService.listInvitations(req.user));
}

async function invite(req, res) {
  return res.status(201).json(await familyService.invite(req.user, req.body?.accountId));
}

async function respond(req, res) {
  return res.json(await familyService.respond(req.user, req.params.id, req.body?.status));
}

module.exports = { list, invite, respond };
