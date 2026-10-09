const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { lockEvacuationCapacity } = require('../services/evacuationRoutingService');

function requireBarangay(req) {
  if (req.user?.role !== 'barangay') throw httpError(403, 'Barangay access required.');
  const barangayName = String(req.user?.barangayName || '').trim();
  if (!barangayName) throw httpError(400, 'No barangay assigned to this account.');
  return barangayName;
}

async function findOwnedCenter(client, centerId, barangayName, lock = false) {
  const result = await client.query(
    `SELECT id, name, barangay, capacity, evacuees, is_active
     FROM evacuation_areas
     WHERE id = $1 AND LOWER(barangay) = LOWER($2)
     ${lock ? 'FOR UPDATE' : ''}`,
    [centerId, barangayName],
  );
  return result.rows[0] || null;
}

async function listCenters(req, res) {
  const barangayName = requireBarangay(req);
  const { rows } = await pool.query(
    `SELECT id, name, barangay, place_type, address, latitude, longitude,
            capacity, LEAST(evacuees, capacity)::int AS evacuees,
            LEAST(evacuees, capacity)::int AS current_count,
            GREATEST(capacity - LEAST(evacuees, capacity), 0)::int AS available_slots,
            GREATEST(capacity - LEAST(evacuees, capacity), 0)::int AS remaining_capacity,
            is_active, created_at
     FROM evacuation_areas
     WHERE LOWER(barangay) = LOWER($1)
     ORDER BY is_active DESC, name`,
    [barangayName],
  );
  return res.json(rows);
}

async function listCases(req, res) {
  const barangayName = requireBarangay(req);
  const centerId = Number(req.params.centerId);
  if (!Number.isSafeInteger(centerId) || centerId <= 0) throw httpError(400, 'Invalid evacuation center.');
  const center = await findOwnedCenter(pool, centerId, barangayName);
  if (!center) throw httpError(404, 'Evacuation center not found in your jurisdiction.');

  const { rows } = await pool.query(
    `SELECT ir.id, ir.report_code, ir.incident_type, ir.location, ir.status,
            ir.evacuees_reserved, ir.created_at, ir.resolved_at,
            ir.evacuation_arrived_at, ir.departure_requested_at, ir.departure_confirmed_at,
            NULLIF(TRIM(CONCAT_WS(' ', resident.first_name, resident.last_name)), '') AS resident_name,
            resident.contact_number,
            dispatch.id AS dispatch_id, dispatch.picked_up_at, dispatch.arrived_at,
            dispatch.assigned_rescuer_id,
            NULLIF(TRIM(CONCAT_WS(' ', rescuer.first_name, rescuer.last_name)), '') AS rescuer_name
     FROM incident_reports ir
     JOIN users resident ON resident.id = ir.reported_by
     LEFT JOIN LATERAL (
       SELECT br.id, br.picked_up_at, br.arrived_at, br.assigned_rescuer_id
       FROM backup_requests br
       WHERE br.report_id = ir.id AND br.declined_at IS NULL
       ORDER BY br.picked_up_at DESC NULLS LAST,
         CASE WHEN br.dispatch_type = 'barangay_responder' THEN 0 ELSE 1 END, br.id DESC
       LIMIT 1
     ) dispatch ON TRUE
     LEFT JOIN users rescuer ON rescuer.id = dispatch.assigned_rescuer_id
     WHERE ir.report_type = 'rescue'
       AND ir.evacuation_area_id = $1
     ORDER BY COALESCE(ir.evacuation_arrived_at, dispatch.picked_up_at, ir.created_at) DESC`,
    [centerId],
  );

  return res.json({
    center,
    incoming: rows.filter((item) => item.picked_up_at && !item.evacuation_arrived_at && !item.arrived_at),
    outgoing: rows.filter((item) => item.evacuation_arrived_at && item.departure_requested_at && !item.departure_confirmed_at),
    current: rows.filter((item) => item.evacuation_arrived_at && !item.departure_confirmed_at),
    resolved: rows.filter((item) => item.status === 'resolved' || item.evacuation_arrived_at),
  });
}

async function updateManualCount(req, res) {
  const barangayName = requireBarangay(req);
  const centerId = Number(req.params.centerId);
  const count = Number(req.body?.count);
  if (!Number.isSafeInteger(centerId) || centerId <= 0) throw httpError(400, 'Invalid evacuation center.');
  if (!Number.isSafeInteger(count) || count < 0) throw httpError(400, 'Current count must be a non-negative whole number.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockEvacuationCapacity(client);
    const { rows } = await client.query(
      `UPDATE evacuation_areas ea SET evacuees = $1
       WHERE ea.id = $2 AND LOWER(ea.barangay) = LOWER($3)
         AND $1 + COALESCE((
           SELECT SUM(ir.evacuees_reserved)
           FROM incident_reports ir
           WHERE ir.evacuation_area_id = ea.id
             AND ir.report_type = 'rescue'
             AND ir.status IN ('accepted', 'in_progress')
             AND ir.evacuation_arrived_at IS NULL
         ), 0) <= ea.capacity
       RETURNING ea.id, ea.capacity, ea.evacuees AS current_count,
         GREATEST(ea.capacity - ea.evacuees, 0)::int AS remaining_capacity`,
      [count, centerId, barangayName],
    );
    if (!rows[0]) {
      const center = await findOwnedCenter(client, centerId, barangayName);
      if (!center) throw httpError(404, 'Evacuation center not found in your jurisdiction.');
      throw httpError(409, `This count would exceed the capacity of ${center.capacity} after including evacuees already en route.`);
    }
    await client.query('COMMIT');
    return res.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function confirmArrival(req, res) {
  const barangayName = requireBarangay(req);
  const centerId = Number(req.params.centerId);
  const reportId = Number(req.params.reportId);
  if (![centerId, reportId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw httpError(400, 'Invalid evacuation center or rescue report.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockEvacuationCapacity(client);
    const center = await findOwnedCenter(client, centerId, barangayName, true);
    if (!center) throw httpError(404, 'Evacuation center not found in your jurisdiction.');
    const reportResult = await client.query(
      `SELECT id, status, report_code, reported_by, evacuees_reserved, evacuation_arrived_at
       FROM incident_reports
       WHERE id = $1 AND evacuation_area_id = $2
       FOR UPDATE`,
      [reportId, centerId],
    );
    const report = reportResult.rows[0];
    if (!report) throw httpError(404, 'Rescue report not found for this evacuation center.');
    if (report.evacuation_arrived_at) {
      await client.query('COMMIT');
      return res.json({ id: report.id, alreadyConfirmed: true });
    }
    const incoming = await client.query(
      `SELECT id FROM backup_requests
       WHERE report_id = $1 AND picked_up_at IS NOT NULL
         AND arrived_at IS NULL AND declined_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [reportId],
    );
    if (!incoming.rows[0]) throw httpError(409, 'Confirm resident pickup before confirming arrival.');
    const amount = Math.max(1, Number(report.evacuees_reserved || 1));
    await client.query(
      `UPDATE incident_reports SET status = 'resolved', resolved_at = COALESCE(resolved_at, NOW()),
         evacuation_arrived_at = NOW(), evacuation_confirmed_by = $2,
         updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [reportId, req.user.userId],
    );
    await client.query(
      `UPDATE backup_requests SET arrived_at = COALESCE(arrived_at, NOW()), confirmed_by = COALESCE(confirmed_by, $2)
       WHERE report_id = $1 AND arrived_at IS NULL AND declined_at IS NULL`,
      [reportId, req.user.userId],
    );
    const capacityUpdate = await client.query(
      `UPDATE evacuation_areas
       SET evacuees = evacuees + $1
       WHERE id = $2 AND evacuees + $1 <= capacity
       RETURNING evacuees, capacity`,
      [amount, centerId],
    );
    if (!capacityUpdate.rows[0]) {
      throw httpError(409, 'This evacuation center no longer has enough capacity. The responder route must be updated.');
    }
    await client.query(
      `INSERT INTO report_status_logs (report_id, old_status, new_status, changed_by, action_note, metadata)
       VALUES ($1, $2, 'resolved', $3, $4, $5::jsonb)`,
      [reportId, report.status, req.user.userId, `Arrival confirmed at ${center.name}.`, JSON.stringify({ centerId, arrivalConfirmed: true, evacuees: amount })],
    );
    await client.query(
      `INSERT INTO user_notifications (user_id, report_id, title, body)
       VALUES ($1, $2, $3, $4)`,
      [report.reported_by, reportId, `Report ${report.report_code || reportId} resolved`, `Your safe arrival at ${center.name} was confirmed.`],
    );
    await client.query('COMMIT');
    return res.json({ id: reportId, arrived: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function recordDeparture(req, res) {
  const barangayName = requireBarangay(req);
  const centerId = Number(req.params.centerId);
  const reportId = Number(req.params.reportId);
  if (![centerId, reportId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw httpError(400, 'Invalid evacuation center or rescue report.');
  }
  const { rows } = await pool.query(
    `UPDATE incident_reports ir SET departure_requested_at = COALESCE(departure_requested_at, NOW()), updated_at = NOW()
     FROM evacuation_areas ea
     WHERE ir.id = $1 AND ir.evacuation_area_id = $2 AND ea.id = ir.evacuation_area_id
       AND LOWER(ea.barangay) = LOWER($3)
       AND ir.evacuation_arrived_at IS NOT NULL AND ir.departure_confirmed_at IS NULL
     RETURNING ir.id, ir.departure_requested_at`,
    [reportId, centerId, barangayName],
  );
  if (!rows[0]) throw httpError(409, 'Only a current evacuee in this center can request departure.');
  return res.json(rows[0]);
}

async function confirmDeparture(req, res) {
  const barangayName = requireBarangay(req);
  const centerId = Number(req.params.centerId);
  const reportId = Number(req.params.reportId);
  if (![centerId, reportId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw httpError(400, 'Invalid evacuation center or rescue report.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const center = await findOwnedCenter(client, centerId, barangayName, true);
    if (!center) throw httpError(404, 'Evacuation center not found in your jurisdiction.');
    const { rows } = await client.query(
      `UPDATE incident_reports SET departure_confirmed_at = NOW(), departure_confirmed_by = $2, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND evacuation_area_id = $3
         AND evacuation_arrived_at IS NOT NULL AND departure_requested_at IS NOT NULL AND departure_confirmed_at IS NULL
       RETURNING id, evacuees_reserved, departure_confirmed_at`,
      [reportId, req.user.userId, centerId],
    );
    if (!rows[0]) throw httpError(409, 'This departure is not pending confirmation.');
    const amount = Math.max(1, Number(rows[0].evacuees_reserved || 1));
    await client.query('UPDATE evacuation_areas SET evacuees = GREATEST(evacuees - $1, 0) WHERE id = $2', [amount, centerId]);
    await client.query('COMMIT');
    return res.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listCenters, listCases, updateManualCount, confirmArrival, recordDeparture, confirmDeparture };
