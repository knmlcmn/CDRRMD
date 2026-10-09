const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { SUPPORTED_BARANGAYS, isSupportedBarangay } = require('../services/supportedBarangays');
const { assignNearestAvailableRescuer, findNearestAvailableRescuer } = require('../services/rescuerDispatchService');

const SUPPORTED_BARANGAY_KEYS = SUPPORTED_BARANGAYS.map((name) => name.toLowerCase());

const router = express.Router();
router.use(auth);
router.use(async (req, res, next) => {
  const { rows } = await pool.query(
    'SELECT id, role, barangay_name FROM users WHERE id = $1 AND COALESCE(is_archived, FALSE) = FALSE',
    [req.user.userId],
  );
  const actor = rows[0];
  if (!actor || !['admin', 'barangay', 'rescuer', 'barangay_rescuer'].includes(actor.role)) {
    return res.status(403).json({ message: 'Admin, barangay, or CDRRMD Rescuer access required.' });
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
    `SELECT br.id, br.barangay_name, br.created_at, br.acknowledged_at, br.declined_at,
            br.decline_reason, br.report_id,
            br.assigned_rescuer_id, br.assigned_at, br.responder_acknowledged_at, br.picked_up_at,
            ir.report_code, ir.report_type, ir.incident_type, ir.status AS report_status,
            ir.location AS report_location, ir.notes AS report_notes, ir.admin_notes AS barangay_notes,
            (ir.image_base64 IS NOT NULL AND ir.image_base64 <> '') AS has_image,
            ir.are_people_trapped, ir.estimated_people,
            CASE WHEN reporter.location_updated_at >= NOW() - INTERVAL '5 minutes'
                      AND reporter.current_latitude IS NOT NULL AND reporter.current_longitude IS NOT NULL
                   THEN reporter.current_latitude ELSE ir.latitude END AS report_latitude,
            CASE WHEN reporter.location_updated_at >= NOW() - INTERVAL '5 minutes'
                      AND reporter.current_latitude IS NOT NULL AND reporter.current_longitude IS NOT NULL
                   THEN reporter.current_longitude ELSE ir.longitude END AS report_longitude,
            ir.evacuation_area_id, ir.evacuation_area_name,
            ea.latitude AS evacuation_latitude, ea.longitude AS evacuation_longitude,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            reporter.contact_number AS reporter_contact, reporter.email AS reporter_email,
            NULLIF(TRIM(CONCAT_WS(' ', rescuer.first_name, rescuer.last_name)), '') AS rescuer_name,
            CONCAT('RSC-', EXTRACT(YEAR FROM rescuer.created_at)::text, '-', LPAD(rescuer.id::text, 5, '0')) AS rescuer_account_id,
            rescuer.contact_number AS rescuer_contact,
            rescuer.current_latitude AS rescuer_latitude,
            rescuer.current_longitude AS rescuer_longitude,
            rescuer.location_updated_at AS rescuer_location_updated_at
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     LEFT JOIN users reporter ON reporter.id = ir.reported_by
     LEFT JOIN users rescuer ON rescuer.id = br.assigned_rescuer_id
     LEFT JOIN evacuation_areas ea ON ea.id = ir.evacuation_area_id
     WHERE br.arrived_at IS NULL
       AND br.declined_at IS NULL
       AND br.dispatch_type = 'cddrmd_backup'
       AND ir.report_type = 'rescue'
       AND ir.status IN ('pending', 'accepted', 'in_progress')
       AND ($1::text IS NULL OR LOWER(br.barangay_name) = LOWER($1))
       AND ($3::integer IS NULL OR br.assigned_rescuer_id = $3)
       AND LOWER(br.barangay_name) = ANY($2::text[])
     ORDER BY br.created_at, br.id`,
    [actor.role === 'barangay' ? actor.barangay_name : null, SUPPORTED_BARANGAY_KEYS, ['rescuer', 'barangay_rescuer'].includes(actor.role) ? actor.id : null],
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
  if (!['accepted', 'in_progress'].includes(reportResult.rows[0].status)) {
    return res.status(400).json({ message: 'Accept the resident rescue request before requesting CDRRMD backup.' });
  }
  if (reportResult.rows[0].latitude == null
    || reportResult.rows[0].longitude == null
    || !Number.isFinite(Number(reportResult.rows[0].latitude))
    || !Number.isFinite(Number(reportResult.rows[0].longitude))) {
    return res.status(400).json({ message: 'The selected incident does not have a mapped location.' });
  }
  // The partial unique index prevents duplicate backup dispatches for this report.
  const { rows } = await pool.query(
    `INSERT INTO backup_requests (barangay_name, requested_by, report_id, dispatch_type)
     VALUES ($1, $2, $3, 'cddrmd_backup')
     ON CONFLICT (report_id, dispatch_type)
       WHERE arrived_at IS NULL AND declined_at IS NULL AND report_id IS NOT NULL
     DO UPDATE SET requested_by = EXCLUDED.requested_by
     RETURNING id, barangay_name, created_at, acknowledged_at, report_id`,
    [actor.barangay_name.trim(), actor.id, reportId],
  );
  return res.status(201).json(rows[0]);
});

router.get('/:id/rescuer-preview', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  const { rows } = await pool.query(
    `SELECT br.id, br.barangay_name, br.acknowledged_at,
            ir.notes, ir.admin_notes, ir.latitude, ir.longitude
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     WHERE br.id = $1 AND br.dispatch_type = 'cddrmd_backup'
       AND br.acknowledged_at IS NULL AND br.declined_at IS NULL AND br.arrived_at IS NULL`,
    [id],
  );
  const request = rows[0];
  if (!request) return res.status(404).json({ message: 'Pending backup request not found.' });
  const rescuer = await findNearestAvailableRescuer(pool, {
    dispatchType: 'cddrmd_backup',
    latitude: request.latitude,
    longitude: request.longitude,
  });
  return res.json({ reportNotes: request.notes || null, barangayNotes: request.admin_notes || null, rescuer });
});

router.patch('/:id/acknowledge', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE backup_requests
       SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
           acknowledged_by = COALESCE(acknowledged_by, $2)
       WHERE id = $1 AND dispatch_type = 'cddrmd_backup' AND arrived_at IS NULL AND declined_at IS NULL
       RETURNING id, acknowledged_at`,
      [id, actor.id],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'This backup request is no longer active.' });
    }
    const assignment = await assignNearestAvailableRescuer(client, id, 'cddrmd_backup', actor.id);
    const previewedRescuerId = Number(req.body?.rescuerId);
    if (Number.isSafeInteger(previewedRescuerId)
      && previewedRescuerId > 0
      && Number(assignment.assigned_rescuer_id) !== previewedRescuerId) {
      throw Object.assign(new Error('The nearest available CDRRMD Rescuer changed. Review the updated assignment and confirm again.'), { status: 409, code: 'RESPONDER_CHANGED' });
    }
    await client.query('COMMIT');
    return res.json({ ...rows[0], ...assignment });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/:id/decline', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  if (!reason) return res.status(400).json({ message: 'A decline reason is required.' });
  const { rows } = await pool.query(
    `UPDATE backup_requests
     SET declined_at = NOW(), declined_by = $2, decline_reason = $3
     WHERE id = $1 AND dispatch_type = 'cddrmd_backup'
       AND arrived_at IS NULL AND declined_at IS NULL AND acknowledged_at IS NULL
     RETURNING id, declined_at, decline_reason`,
    [id, actor.id, reason],
  );
  if (!rows[0]) return res.status(409).json({ message: 'Only a pending backup request can be declined.' });
  return res.json(rows[0]);
});

router.patch('/:id/respond', async (req, res) => {
  const actor = req.backupActor;
  if (!['rescuer', 'barangay_rescuer'].includes(actor.role)) {
    return res.status(403).json({ message: 'Assigned responder access required.' });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT br.id, br.report_id, br.dispatch_type, br.assigned_rescuer_id,
              br.responder_acknowledged_at, ir.status, ir.reported_by, ir.report_code
       FROM backup_requests br
       JOIN incident_reports ir ON ir.id = br.report_id
       WHERE br.id = $1 AND br.arrived_at IS NULL AND br.declined_at IS NULL
       FOR UPDATE OF br, ir`,
      [id],
    );
    const dispatch = rows[0];
    if (!dispatch) throw Object.assign(new Error('This dispatch is no longer active.'), { status: 404 });
    if (Number(dispatch.assigned_rescuer_id) !== actor.id) {
      throw Object.assign(new Error('This dispatch is assigned to another responder.'), { status: 403 });
    }
    const expectedType = actor.role === 'barangay_rescuer' ? 'barangay_responder' : 'cddrmd_backup';
    if (dispatch.dispatch_type !== expectedType) {
      throw Object.assign(new Error('This dispatch does not match your responder role.'), { status: 403 });
    }
    if (!dispatch.responder_acknowledged_at) {
      await client.query(
        `UPDATE backup_requests
         SET responder_acknowledged_at = NOW(), responder_acknowledged_by = $2
         WHERE id = $1`,
        [id, actor.id],
      );
      await client.query(
        `INSERT INTO report_status_logs
           (report_id, old_status, new_status, changed_by, action_note, metadata)
         VALUES ($1, $2, $2, $3, $4, $5::jsonb)`,
        [dispatch.report_id, dispatch.status, actor.id, 'Assigned responder acknowledged the dispatch.', JSON.stringify({ dispatchId: id, dispatchType: dispatch.dispatch_type })],
      );
      await client.query(
        `INSERT INTO user_notifications (user_id, report_id, title, body)
         VALUES ($1, $2, $3, $4)`,
        [dispatch.reported_by, dispatch.report_id, `Report ${dispatch.report_code || dispatch.report_id} updated`, 'Your assigned responder confirmed the dispatch and is now traveling to your location.'],
      );
    }
    const acknowledged = await client.query(
      `SELECT id, report_id, responder_acknowledged_at
       FROM backup_requests WHERE id = $1`,
      [id],
    );
    await client.query('COMMIT');
    return res.json(acknowledged.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ message: error.message });
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/:id/complete', async (req, res) => {
  return res.status(409).json({
    message: 'Only Barangay Evacuation Personnel can confirm arrival and resolve the rescue report.',
  });
});

module.exports = router;
