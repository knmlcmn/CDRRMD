const express = require('express');
const auth = require('../middleware/auth');
const {
  getAlerts,
  createAlert,
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
router.get('/alerts', getAlerts);
router.post('/alerts', auth, createAlert);

router.get('/announcements', getAnnouncements);
router.post('/announcements', auth, createAnnouncement);

// Evacuation list is public; mutating operations require auth.
router.get('/evacuation-areas', getEvacuationAreas);
router.post('/evacuation-areas', auth, createEvacuationArea);
router.put('/evacuation-areas/:id', auth, updateEvacuationArea);
router.delete('/evacuation-areas/:id', auth, deleteEvacuationArea);
router.get('/dashboard-summary', auth, getDashboardSummary);

module.exports = router;
