const express = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/familyController');

const router = express.Router();

router.use(auth);
router.get('/', controller.list);
router.post('/invitations', controller.invite);
router.patch('/invitations/:id', controller.respond);

module.exports = router;
