const express = require('express');
const auth = require('../middleware/auth');
const authFlexible = require('../middleware/authFlexible');
const {
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
  heartbeatPresence,
  markPresenceOffline,
} = require('../controllers/barangayController');
const { getReportImage, updateReportStatus } = require('../controllers/reportController');
const evacuationCenter = require('../controllers/evacuationCenterController');
const barangayRescuer = require('../controllers/barangayRescuerController');
const rescuerAccounts = require('../controllers/rescuerController');

const router = express.Router();

// Wrap async route handlers so unhandled rejections reach the global error middleware
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Admin: manage barangay accounts
router.get('/accounts', auth, asyncHandler(listAccounts));
router.get('/accounts/archived', auth, asyncHandler(listArchivedAccounts));
router.post('/accounts', auth, asyncHandler(createAccount));
router.patch('/accounts/:id', auth, asyncHandler(updateAccount));
router.patch('/accounts/:id/restore', auth, asyncHandler(restoreAccount));
router.delete('/accounts/:id/permanent', auth, asyncHandler(permanentlyDeleteAccount));
router.delete('/accounts/:id', auth, asyncHandler(archiveAccount));

// Barangay: own jurisdiction
router.get('/personnel', auth, asyncHandler(rescuerAccounts.listAccounts));
router.post('/personnel', auth, asyncHandler(rescuerAccounts.createAccount));
router.patch('/personnel/:id', auth, asyncHandler(rescuerAccounts.updateAccount));
router.delete('/personnel/:id', auth, asyncHandler(rescuerAccounts.archiveAccount));
router.get('/reports/mine', auth, asyncHandler(getMyReports));
router.get('/reports/:id/image', auth, asyncHandler(getReportImage));
router.get('/reports/:id/rescuer-preview', auth, asyncHandler(barangayRescuer.previewNearestRescuer));
router.patch('/reports/:id/status', auth, asyncHandler(updateReportStatus));
router.get('/evacuation-centers', auth, asyncHandler(evacuationCenter.listCenters));
router.get('/evacuation-centers/:centerId/cases', auth, asyncHandler(evacuationCenter.listCases));
router.patch('/evacuation-centers/:centerId/count', auth, asyncHandler(evacuationCenter.updateManualCount));
router.patch('/evacuation-centers/:centerId/cases/:reportId/arrival', auth, asyncHandler(evacuationCenter.confirmArrival));
router.patch('/evacuation-centers/:centerId/cases/:reportId/departure-request', auth, asyncHandler(evacuationCenter.recordDeparture));
router.patch('/evacuation-centers/:centerId/cases/:reportId/departure', auth, asyncHandler(evacuationCenter.confirmDeparture));
router.get('/me', auth, asyncHandler(getMyProfile));
router.patch('/me', auth, asyncHandler(updateMyProfile));
router.post('/presence/heartbeat', auth, asyncHandler(heartbeatPresence));
router.post('/presence/offline', authFlexible, asyncHandler(markPresenceOffline));

module.exports = router;
