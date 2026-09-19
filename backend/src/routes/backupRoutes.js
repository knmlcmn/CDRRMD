const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { SUPPORTED_BARANGAYS, isSupportedBarangay } = require('../services/supportedBarangays');

const SUPPORTED_BARANGAY_KEYS = SUPPORTED_BARANGAYS.map((name) => name.toLowerCase());

const router = express.Router();
router.use(auth);
router.use(async (req, res, next) => {
  const { rows } = await pool.query(
    'SELECT id, role, barangay_name FROM users WHERE id = $1 AND COALESCE(is_archived, FALSE) = FALSE',
    [req.user.userId],
  );
  const actor = rows[0];
  if (!actor || !['admin', 'barangay'].includes(actor.role)) {
    return res.status(403).json({ message: 'Admin or barangay access required.' });
  }
  if (actor.role === 'barangay' && !actor.barangay_name?.trim()) {
    return res.status(403).json({ message: 'No barangay assigned to this account.' });
  }
  if (actor.role === 'barangay' && !isSupportedBarangay(actor.barangay_name)) {
    return res.status(403).json({ message: 'Backup requests are available only to the six supported barangays.' });
  }
  req.backupActor = actor;
  return next();
});

router.get('/', async (req, res) => {
  const actor = req.backupActor;
  const { rows } = await pool.query(
    `SELECT br.id, br.barangay_name, br.created_at, br.acknowledged_at, br.report_id,
            ir.report_code, ir.report_type, ir.incident_type, ir.status AS report_status,
            ir.location AS report_location, ir.notes AS report_notes,
            ir.are_people_trapped, ir.estimated_people,
            ir.latitude AS report_latitude, ir.longitude AS report_longitude,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            reporter.contact_number AS reporter_contact
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     LEFT JOIN users reporter ON reporter.id = ir.reported_by
     WHERE br.arrived_at IS NULL
       AND ir.report_type = 'rescue'
       AND ir.status IN ('pending', 'accepted', 'in_progress')
       AND ($1::text IS NULL OR LOWER(br.barangay_name) = LOWER($1))
       AND LOWER(br.barangay_name) = ANY($2::text[])
     ORDER BY br.created_at, br.id`,
    [actor.role === 'admin' ? null : actor.barangay_name, SUPPORTED_BARANGAY_KEYS],
  );
  res.set('Cache-Control', 'no-store');
  return res.json(rows);
});

router.post('/', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'barangay') return res.status(403).json({ message: 'Barangay access required.' });
  const reportId = Number(req.body?.reportId);
  if (!Number.isSafeInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ message: 'Select the incident that needs CDRRMD backup.' });
  }
  const reportResult = await pool.query(
    `SELECT id, report_type, status, latitude, longitude FROM incident_reports
     WHERE id = $1 AND LOWER(assigned_barangay) = LOWER($2)
     LIMIT 1`,
    [reportId, actor.barangay_name],
  );
  if (!reportResult.rows[0]) {
    return res.status(404).json({ message: 'The selected incident is not assigned to this barangay.' });
  }
  if (reportResult.rows[0].report_type !== 'rescue') {
    return res.status(400).json({ message: 'CDRRMD backup can only be requested for rescue reports.' });
  }
  if (!['pending', 'accepted', 'in_progress'].includes(reportResult.rows[0].status)) {
    return res.status(400).json({ message: 'This rescue request is no longer active.' });
  }
  if (reportResult.rows[0].latitude == null
    || reportResult.rows[0].longitude == null
    || !Number.isFinite(Number(reportResult.rows[0].latitude))
    || !Number.isFinite(Number(reportResult.rows[0].longitude))) {
    return res.status(400).json({ message: 'The selected incident does not have a mapped location.' });
  }
  // The partial unique index prevents duplicates, including simultaneous clicks from different devices.
  const { rows } = await pool.query(
    `INSERT INTO backup_requests (barangay_name, requested_by, report_id) VALUES ($1, $2, $3)
     ON CONFLICT (LOWER(barangay_name)) WHERE arrived_at IS NULL
     DO UPDATE SET report_id = COALESCE(backup_requests.report_id, EXCLUDED.report_id)
     RETURNING id, barangay_name, created_at, acknowledged_at, report_id`,
    [actor.barangay_name.trim(), actor.id, reportId],
  );
  return res.status(201).json(rows[0]);
});

router.patch('/:id/acknowledge', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  const { rows } = await pool.query(
    `UPDATE backup_requests
     SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
         acknowledged_by = COALESCE(acknowledged_by, $2)
     WHERE id = $1 AND arrived_at IS NULL
     RETURNING id, acknowledged_at`,
    [id, actor.id],
  );
  if (!rows[0]) return res.status(404).json({ message: 'This backup request is no longer active.' });
  return res.json(rows[0]);
});

module.exports = router;
