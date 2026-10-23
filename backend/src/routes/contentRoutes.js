const express = require('express');
const auth = require('../middleware/auth');
const cacheResponse = require('../middleware/cacheResponse');
const {
  getAlerts,
  createAlert,
  publishFloodSensorAlert,
  triggerFloodSensorSync,
  getAnnouncements,
  createAnnouncement,
  getEvacuationAreas,
  createEvacuationArea,
  updateEvacuationArea,
  deleteEvacuationArea,
  getDashboardSummary,
} = require('../controllers/contentController');

const router = express.Router();

// Alerts and announcements are publicly readable, admin posting is protected.
router.get('/alerts', cacheResponse({ key: 'http:content:alerts', ttlMs: 2_000 }), getAlerts);
router.post('/alerts', auth, createAlert);
router.post('/flood-sensor-alerts', auth, publishFloodSensorAlert);
router.post('/flood-sensor-sync', triggerFloodSensorSync);

router.get('/announcements', cacheResponse({ key: 'http:content:announcements', ttlMs: 2_000 }), getAnnouncements);
router.post('/announcements', auth, createAnnouncement);

// Evacuation list is public; mutating operations require auth.
router.get('/evacuation-areas', cacheResponse({ key: 'http:content:evacuation-areas', ttlMs: 1_000 }), getEvacuationAreas);
router.post('/evacuation-areas', auth, createEvacuationArea);
router.put('/evacuation-areas/:id', auth, updateEvacuationArea);
router.delete('/evacuation-areas/:id', auth, deleteEvacuationArea);
router.get('/dashboard-summary', auth, cacheResponse({ key: 'http:content:dashboard-summary', ttlMs: 1_000 }), getDashboardSummary);

module.exports = router;
