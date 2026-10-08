const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { findNearestAvailableRescuer } = require('../services/rescuerDispatchService');

function requireBarangay(req) {
  if (req.user?.role !== 'barangay') throw httpError(403, 'Barangay access required.');
  const barangayName = String(req.user?.barangayName || '').trim();
  if (!barangayName) throw httpError(400, 'No barangay assigned to this account.');
  return barangayName;
}

async function previewNearestRescuer(req, res) {
  const barangayName = requireBarangay(req);
  const reportId = Number(req.params.id);
  if (!Number.isSafeInteger(reportId) || reportId <= 0) throw httpError(400, 'Invalid rescue report.');
  const { rows } = await pool.query(
    `SELECT id, status, notes, latitude, longitude
     FROM incident_reports
     WHERE id = $1 AND report_type = 'rescue' AND status = 'pending'
       AND LOWER(assigned_barangay) = LOWER($2)`,
    [reportId, barangayName],
  );
  const report = rows[0];
  if (!report) throw httpError(404, 'Pending rescue report not found in your jurisdiction.');
  const rescuer = await findNearestAvailableRescuer(pool, {
    dispatchType: 'barangay_responder',
    barangayName,
    latitude: report.latitude,
    longitude: report.longitude,
  });
  return res.json({ reportNotes: report.notes || null, rescuer });
}

module.exports = { previewNearestRescuer };
