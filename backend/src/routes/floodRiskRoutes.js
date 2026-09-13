const express = require('express');
const {
	getCalambaFloodRisk,
	getCalambaFloodZones,
	getCalambaFloodRaster,
	getCalambaBarangayBoundaries,
	getCalambaBarangayPolygons,
	getCalambaRainImpact,
} = require('../controllers/floodRiskController');

const router = express.Router();

// Flood intelligence endpoints for the Calamba map layers.
router.get('/calamba', getCalambaFloodRisk);
router.get('/calamba/zones', getCalambaFloodZones);
router.get('/calamba/raster', getCalambaFloodRaster);
router.get('/calamba/barangays', getCalambaBarangayBoundaries);
router.get('/calamba/barangay-polygons', getCalambaBarangayPolygons);
router.get('/calamba/rain-impact', getCalambaRainImpact);

module.exports = router;
