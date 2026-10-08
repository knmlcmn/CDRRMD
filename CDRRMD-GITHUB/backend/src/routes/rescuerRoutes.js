const express = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/rescuerController');

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth);
router.get('/accounts', asyncHandler(controller.listAccounts));
router.get('/accounts/archived', asyncHandler(controller.listArchivedAccounts));
router.post('/accounts', asyncHandler(controller.createAccount));
router.patch('/accounts/:id', asyncHandler(controller.updateAccount));
router.patch('/accounts/:id/restore', asyncHandler(controller.restoreAccount));
router.delete('/accounts/:id/permanent', asyncHandler(controller.permanentlyDeleteAccount));
router.delete('/accounts/:id', asyncHandler(controller.archiveAccount));
router.get('/incidents/mine', asyncHandler(controller.listMyIncidents));
router.get('/incidents/history', asyncHandler(controller.listMyIncidentHistory));
router.get('/flood-reports', asyncHandler(controller.listFloodReports));
router.patch('/location', asyncHandler(controller.updateMyLocation));

module.exports = router;
