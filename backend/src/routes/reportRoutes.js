const express = require('express');
const auth = require('../middleware/auth');
const {
	createReport,
	getMyReports,
	getReports,
	updateReportStatus,
	getReportLogs,
	getMyNotifications,
	markAllNotificationsRead,
	markNotificationRead,
} = require('../controllers/reportController');

const router = express.Router();

// Incident reporting and workflow endpoints.
router.post('/', auth, createReport);
router.get('/mine', auth, getMyReports);
router.get('/notifications/mine', auth, getMyNotifications);
router.patch('/notifications/read-all', auth, markAllNotificationsRead);
router.patch('/notifications/:id/read', auth, markNotificationRead);
router.get('/', auth, getReports);
router.patch('/:id/status', auth, updateReportStatus);
router.get('/:id/logs', auth, getReportLogs);

module.exports = router;
