const express = require('express');
const auth = require('../middleware/auth');
const {
  getPopulationDataForAdmin,
  getPopulationDensity,
  updatePopulationData,
} = require('../controllers/populationDensityController');

const router = express.Router();

// Portal GIS reads remain public and server-gated; mutations are separately authenticated below.
router.get(
  '/population-density',
  getPopulationDensity,
);

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'CDRRMD Administrator access required.' });
  }
  return next();
}

router.get('/population-density/manage', auth, requireAdmin, getPopulationDataForAdmin);
router.put('/population-density/:barangay', auth, requireAdmin, updatePopulationData);

module.exports = router;
module.exports.requireAdmin = requireAdmin;
