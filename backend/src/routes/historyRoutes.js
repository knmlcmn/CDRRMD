const express = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/historyController');

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth);
router.get('/incidents', asyncHandler(controller.listIncidentHistory));
router.get('/backups', asyncHandler(controller.listBackupHistory));
router.get('/water-levels', asyncHandler(controller.listWaterLevelHistory));

module.exports = router;
