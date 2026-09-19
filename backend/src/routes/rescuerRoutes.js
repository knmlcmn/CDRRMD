const express = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/rescuerController');

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth);
router.get('/accounts', asyncHandler(controller.listAccounts));
router.post('/accounts', asyncHandler(controller.createAccount));
router.patch('/accounts/:id', asyncHandler(controller.updateAccount));
router.delete('/accounts/:id', asyncHandler(controller.archiveAccount));
router.get('/incidents/mine', asyncHandler(controller.listMyIncidents));
router.patch('/location', asyncHandler(controller.updateMyLocation));

module.exports = router;
