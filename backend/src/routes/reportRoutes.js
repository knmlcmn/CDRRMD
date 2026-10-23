const express = require('express');
const auth = require('../middleware/auth');
const {
	createReport,
	getMyReports,
	getReports,
	getReportImage,
	getReportHistory,
	updateReportStatus,
	getReportLogs,
	getMyNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	registerPushToken,
	unregisterPushToken,
} = require('../controllers/reportController');

const router = express.Router();

// Incident reporting and workflow endpoints.
router.post('/', auth, createReport);
router.get('/mine', auth, getMyReports);
router.get('/notifications/mine', auth, getMyNotifications);
router.patch('/notifications/read-all', auth, markAllNotificationsRead);
router.patch('/notifications/:id/read', auth, markNotificationRead);
router.post('/notifications/push-token', auth, registerPushToken);
router.delete('/notifications/push-token', auth, unregisterPushToken);
router.get('/history', auth, getReportHistory);
router.get('/', auth, getReports);
router.get('/:id/image', auth, getReportImage);
router.patch('/:id/status', auth, updateReportStatus);
router.get('/:id/logs', auth, getReportLogs);

module.exports = router;
