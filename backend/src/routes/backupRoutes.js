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
  if (!actor || !['admin', 'barangay', 'rescuer'].includes(actor.role)) {
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
            br.assigned_rescuer_id, br.assigned_at, br.picked_up_at,
            ir.report_code, ir.report_type, ir.incident_type, ir.status AS report_status,
            ir.location AS report_location, ir.notes AS report_notes,
            ir.are_people_trapped, ir.estimated_people,
            ir.latitude AS report_latitude, ir.longitude AS report_longitude,
            ir.evacuation_area_id, ir.evacuation_area_name,
            ea.latitude AS evacuation_latitude, ea.longitude AS evacuation_longitude,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            reporter.contact_number AS reporter_contact,
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
       AND ir.report_type = 'rescue'
       AND ir.status IN ('pending', 'accepted', 'in_progress')
       AND ($1::text IS NULL OR LOWER(br.barangay_name) = LOWER($1))
       AND ($3::integer IS NULL OR br.assigned_rescuer_id = $3)
       AND LOWER(br.barangay_name) = ANY($2::text[])
     ORDER BY br.created_at, br.id`,
    [actor.role === 'barangay' ? actor.barangay_name : null, SUPPORTED_BARANGAY_KEYS, actor.role === 'rescuer' ? actor.id : null],
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
  // The partial unique index prevents duplicates, including simultaneous clicks from different devices.
  const { rows } = await pool.query(
    `INSERT INTO backup_requests (barangay_name, requested_by, report_id) VALUES ($1, $2, $3)
     ON CONFLICT (LOWER(barangay_name)) WHERE arrived_at IS NULL AND declined_at IS NULL
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
     WHERE id = $1 AND arrived_at IS NULL AND declined_at IS NULL
     RETURNING id, acknowledged_at`,
    [id, actor.id],
  );
  if (!rows[0]) return res.status(404).json({ message: 'This backup request is no longer active.' });
  return res.json(rows[0]);
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
     WHERE id = $1 AND arrived_at IS NULL AND declined_at IS NULL AND acknowledged_at IS NULL
     RETURNING id, declined_at, decline_reason`,
    [id, actor.id, reason],
  );
  if (!rows[0]) return res.status(409).json({ message: 'Only a pending backup request can be declined.' });
  return res.json(rows[0]);
});

router.patch('/:id/assign', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  const id = Number(req.params.id);
  const rescuerId = Number(req.body?.rescuerId);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(rescuerId) || rescuerId <= 0) {
    return res.status(400).json({ message: 'A valid backup request and CDRRMD Rescuer are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT br.id, br.report_id, br.acknowledged_at, br.assigned_rescuer_id,
              ir.status, ir.reported_by, ir.report_code
       FROM backup_requests br
       JOIN incident_reports ir ON ir.id = br.report_id
       WHERE br.id = $1 AND br.arrived_at IS NULL AND br.declined_at IS NULL
       FOR UPDATE OF br, ir`,
      [id],
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'This backup request is no longer active.' });
    }
    if (!request.acknowledged_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Confirm the backup request before assigning a rescuer.' });
    }

    const rescuerResult = await client.query(
      `SELECT id, first_name, last_name, username, created_at
       FROM users
       WHERE id = $1 AND role = 'rescuer' AND COALESCE(is_archived, FALSE) = FALSE
       FOR UPDATE`,
      [rescuerId],
    );
    const rescuer = rescuerResult.rows[0];
    if (!rescuer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'CDRRMD Rescuer account not found.' });
    }
    const busyResult = await client.query(
      `SELECT id FROM backup_requests
       WHERE assigned_rescuer_id = $1 AND arrived_at IS NULL AND declined_at IS NULL AND id <> $2 LIMIT 1`,
      [rescuerId, id],
    );
    if (busyResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'That CDRRMD Rescuer team is already assigned to another active incident.' });
    }

    const accountId = `RSC-${new Date(rescuer.created_at).getFullYear()}-${String(rescuer.id).padStart(5, '0')}`;
    const displayName = [rescuer.first_name, rescuer.last_name].filter(Boolean).join(' ') || rescuer.username;
    const teamLabel = `CDRRMD Rescuer - ${displayName} (${accountId})`;
    const assignedResult = await client.query(
      `UPDATE backup_requests
       SET assigned_rescuer_id = $2, assigned_at = NOW()
       WHERE id = $1
       RETURNING id, report_id, assigned_rescuer_id, assigned_at`,
      [id, rescuerId],
    );
    await client.query(
      `UPDATE incident_reports
       SET assigned_team = $2,
           status = CASE WHEN status IN ('pending', 'accepted') THEN 'in_progress' ELSE status END,
           dispatched_at = COALESCE(dispatched_at, NOW()), updated_at = NOW(), updated_by = $3
       WHERE id = $1`,
      [request.report_id, teamLabel, actor.id],
    );
    await client.query(
      `INSERT INTO report_status_logs (report_id, old_status, new_status, changed_by, action_note, metadata)
       VALUES ($1, $2, 'in_progress', $3, $4, $5::jsonb)`,
      [request.report_id, request.status, actor.id, 'Admin assigned a CDRRMD Rescuer team for backup.', JSON.stringify({ rescuerId, teamLabel })],
    );
    await client.query(
      `INSERT INTO user_notifications (user_id, report_id, title, body)
       VALUES ($1, $2, $3, $4)`,
      [request.reported_by, request.report_id, `Report ${request.report_code || request.report_id} updated`, `${displayName} from CDRRMD was assigned as backup. The Barangay team is continuing the rescue response.`],
    );
    await client.query('COMMIT');
    return res.json({ ...assignedResult.rows[0], rescuer_name: displayName, rescuer_account_id: accountId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/:id/pickup', async (req, res) => {
  const actor = req.backupActor;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT br.*, ir.reported_by, ir.report_code, ir.status, ir.evacuation_area_id, ir.evacuation_area_name
       FROM backup_requests br JOIN incident_reports ir ON ir.id = br.report_id
       WHERE br.id = $1 AND br.arrived_at IS NULL AND br.declined_at IS NULL FOR UPDATE OF br, ir`,
      [id],
    );
    const request = result.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'This backup request is no longer active.' });
    }
    const isAssignedRescuer = actor.role === 'rescuer' && Number(request.assigned_rescuer_id) === actor.id;
    const isMatchingBarangay = actor.role === 'barangay'
      && String(request.barangay_name).toLowerCase() === String(actor.barangay_name).toLowerCase();
    if (!isAssignedRescuer && !isMatchingBarangay) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Only the assigned response teams can confirm pickup.' });
    }
    if (!request.assigned_rescuer_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A CDRRMD Rescuer must be assigned before pickup can be confirmed.' });
    }
    if (request.picked_up_at) {
      await client.query('COMMIT');
      return res.json({ id: request.id, report_id: request.report_id, picked_up_at: request.picked_up_at });
    }
    if (!request.evacuation_area_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This incident has no designated evacuation center.' });
    }

    const pickupResult = await client.query(
      `UPDATE backup_requests SET picked_up_at = COALESCE(picked_up_at, NOW())
       WHERE id = $1 RETURNING id, report_id, picked_up_at`,
      [id],
    );
    await client.query(
      `UPDATE incident_reports SET status = 'in_progress', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [request.report_id, actor.id],
    );
    await client.query(
      `INSERT INTO report_status_logs (report_id, old_status, new_status, changed_by, action_note, metadata)
       VALUES ($1, $2, 'in_progress', $3, $4, $5::jsonb)`,
      [request.report_id, request.status, actor.id, `Resident picked up. Both teams are proceeding to ${request.evacuation_area_name}.`, JSON.stringify({ backupRequestId: id, pickedUp: true })],
    );
    await client.query(
      `INSERT INTO user_notifications (user_id, report_id, title, body)
       VALUES ($1, $2, $3, $4)`,
      [request.reported_by, request.report_id, `Report ${request.report_code || request.report_id} updated`, `You have been rescued. Responders are taking you to ${request.evacuation_area_name}.`],
    );
    await client.query('COMMIT');
    return res.json(pickupResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.patch('/:id/complete', async (req, res) => {
  const actor = req.backupActor;
  if (actor.role !== 'rescuer') return res.status(403).json({ message: 'CDRRMD Rescuer access required.' });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid request ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT br.*, ir.reported_by, ir.report_code, ir.status, ir.evacuation_area_name
       FROM backup_requests br JOIN incident_reports ir ON ir.id = br.report_id
       WHERE br.id = $1 AND br.arrived_at IS NULL AND br.declined_at IS NULL FOR UPDATE OF br, ir`,
      [id],
    );
    const request = result.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'This backup request is no longer active.' });
    }
    if (Number(request.assigned_rescuer_id) !== actor.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'This incident is assigned to another CDRRMD Rescuer team.' });
    }
    if (!request.picked_up_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Confirm resident pickup before completing the evacuation.' });
    }
    await client.query(
      `UPDATE incident_reports SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(), updated_by = $2
       WHERE id = $1`,
      [request.report_id, actor.id],
    );
    const completedResult = await client.query(
      `UPDATE backup_requests SET arrived_at = NOW(), confirmed_by = $2
       WHERE id = $1 RETURNING id, report_id, arrived_at`,
      [id, actor.id],
    );
    await client.query(
      `INSERT INTO report_status_logs (report_id, old_status, new_status, changed_by, action_note, metadata)
       VALUES ($1, $2, 'resolved', $3, $4, $5::jsonb)`,
      [request.report_id, request.status, actor.id, `Resident safely arrived at ${request.evacuation_area_name}.`, JSON.stringify({ backupRequestId: id, evacuationCompleted: true })],
    );
    await client.query(
      `INSERT INTO user_notifications (user_id, report_id, title, body)
       VALUES ($1, $2, $3, $4)`,
      [request.reported_by, request.report_id, `Report ${request.report_code || request.report_id} resolved`, `Rescue completed. You arrived safely at ${request.evacuation_area_name}.`],
    );
    await client.query('COMMIT');
    return res.json(completedResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

module.exports = router;
