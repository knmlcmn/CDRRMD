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
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const authRateLimit = rateLimit({ namespace: 'auth', limit: 30, windowMs: 10 * 60_000 });
const otpRateLimit = rateLimit({ namespace: 'otp', limit: 5, windowMs: 10 * 60_000 });

// Public auth actions.
router.post('/register', authRateLimit, register);
router.post('/registration-otp', otpRateLimit, requestRegistrationOtp);
router.post('/password-reset-otp', otpRateLimit, requestPasswordResetOtp);
router.post('/password-reset', authRateLimit, resetPassword);
router.post('/login', authRateLimit, login);
router.post('/refresh', authRateLimit, refresh);

// Logout — uses authFlexible so it works via normal header AND via sendBeacon (tab-close) which passes token in body.
router.post('/logout', authFlexible, logout);

// Profile endpoints require a valid access token.
router.get('/me', auth, me);
router.put('/me', auth, updateMe);
router.put('/location-barangay', auth, assignBarangayFromLocation);

module.exports = router;
