const express = require('express');
const cacheResponse = require('../middleware/cacheResponse');
const {
	getCalambaFloodRisk,
	getCalambaFloodZones,
	getCalambaFloodRaster,
	getCalambaBarangayBoundaries,
	getCalambaBarangayPolygons,
	getCalambaRainImpact,
	getHardwareSensorSnapshot,
} = require('../controllers/floodRiskController');

const router = express.Router();

// Flood intelligence endpoints for the Calamba map layers.
router.get('/calamba', cacheResponse({ key: 'http:flood:calamba', ttlMs: 5 * 60_000 }), getCalambaFloodRisk);
router.get('/calamba/zones', cacheResponse({ key: 'http:flood:zones', ttlMs: 10 * 60_000 }), getCalambaFloodZones);
router.get('/calamba/raster', cacheResponse({ key: 'http:flood:raster', ttlMs: 10 * 60_000 }), getCalambaFloodRaster);
router.get('/calamba/barangays', cacheResponse({ key: 'http:flood:barangays', ttlMs: 60 * 60_000 }), getCalambaBarangayBoundaries);
router.get('/calamba/barangay-polygons', cacheResponse({ key: 'http:flood:barangay-polygons', ttlMs: 60 * 60_000 }), getCalambaBarangayPolygons);
router.get('/calamba/rain-impact', cacheResponse({ key: 'http:flood:rain-impact', ttlMs: 60_000 }), getCalambaRainImpact);
router.get('/hardware-sensors', cacheResponse({ key: 'http:flood:hardware-sensors', ttlMs: 500 }), getHardwareSensorSnapshot);

module.exports = router;
