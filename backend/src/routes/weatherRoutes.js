const express = require('express');
const { getWeather } = require('../controllers/weatherController');
const { getWindField } = require('../controllers/windController');

const router = express.Router();

// Public weather endpoint consumed by both admin and mobile apps.
router.get('/', getWeather);
router.get('/wind-field', getWindField);

module.exports = router;
