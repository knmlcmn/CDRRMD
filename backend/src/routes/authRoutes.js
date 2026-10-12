const express = require('express');
const {
  login,
  register,
  requestRegistrationOtp,
  requestPasswordResetOtp,
  resetPassword,
  logout,
  refresh,
  me,
  updateMe,
  assignBarangayFromLocation,
} = require('../controllers/authController');
const auth = require('../middleware/auth');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();

// Public auth actions.
router.post('/register', register);
router.post('/registration-otp', requestRegistrationOtp);
router.post('/password-reset-otp', requestPasswordResetOtp);
router.post('/password-reset', resetPassword);
router.post('/login', login);
router.post('/refresh', refresh);

// Logout — uses authFlexible so it works via normal header AND via sendBeacon (tab-close) which passes token in body.
router.post('/logout', authFlexible, logout);

// Profile endpoints require a valid access token.
router.get('/me', auth, me);
router.put('/me', auth, updateMe);
router.put('/location-barangay', auth, assignBarangayFromLocation);

module.exports = router;
