const express = require('express');
const { getPopulationDensity } = require('../controllers/populationDensityController');

const router = express.Router();

// Static, read-only GIS research layers. Feature availability is server-gated.
router.get(
  '/population-density',
  getPopulationDensity,
);

module.exports = router;
