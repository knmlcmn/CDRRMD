const express = require('express');
const { login, register, logout, refresh, me, updateMe } = require('../controllers/authController');
const auth = require('../middleware/auth');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();

// Public auth actions.
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);

// Logout — uses authFlexible so it works via normal header AND via sendBeacon (tab-close) which passes token in body.
router.post('/logout', authFlexible, logout);

// Profile endpoints require a valid access token.
router.get('/me', auth, me);
router.put('/me', auth, updateMe);

module.exports = router;
