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
const { updateReportStatus } = require('../controllers/reportController');

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
router.get('/reports/mine', auth, asyncHandler(getMyReports));
router.patch('/reports/:id/status', auth, asyncHandler(updateReportStatus));
router.get('/me', auth, asyncHandler(getMyProfile));
router.patch('/me', auth, asyncHandler(updateMyProfile));
router.post('/presence/heartbeat', auth, asyncHandler(heartbeatPresence));
router.post('/presence/offline', authFlexible, asyncHandler(markPresenceOffline));

module.exports = router;
