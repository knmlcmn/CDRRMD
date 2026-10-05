const { httpError } = require('../utils/httpError');

const CDRRMD_BASE = { latitude: 14.194052, longitude: 121.159688 };

function dispatchConfig(dispatchType) {
  if (dispatchType === 'barangay_responder') {
    return {
      role: 'barangay_rescuer',
      accountPrefix: 'BRS',
      teamPrefix: 'Barangay Rescuer',
      assignmentNote: 'Nearest available Barangay Rescuer assigned automatically.',
      unavailableMessage: 'No Barangay Rescuer is currently available for this jurisdiction.',
    };
  }
  if (dispatchType === 'cddrmd_backup') {
    return {
      role: 'rescuer',
      accountPrefix: 'RSC',
      teamPrefix: 'CDRRMD Rescuer',
      assignmentNote: 'Nearest available CDRRMD Rescuer assigned automatically.',
      unavailableMessage: 'No CDRRMD Rescuer is currently available for backup.',
    };
  }
  throw httpError(400, 'Unsupported rescue dispatch type.');
}

async function findNearestAvailableRescuer(client, {
  dispatchType,
  barangayName = null,
  latitude,
  longitude,
  excludeDispatchId = 0,
  lock = false,
}) {
  const config = dispatchConfig(dispatchType);
  const fallbackLatitude = dispatchType === 'cddrmd_backup' ? CDRRMD_BASE.latitude : null;
  const fallbackLongitude = dispatchType === 'cddrmd_backup' ? CDRRMD_BASE.longitude : null;
  const { rows } = await client.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.created_at,
            COALESCE(u.is_active, FALSE) AND u.last_seen_at >= NOW() - INTERVAL '45 seconds' AS is_online,
            COALESCE(u.current_latitude, bb.centroid_lat, $5::double precision) AS dispatch_latitude,
            COALESCE(u.current_longitude, bb.centroid_lon, $6::double precision) AS dispatch_longitude,
            CASE
              WHEN COALESCE(u.current_latitude, bb.centroid_lat, $5::double precision) IS NULL
                OR COALESCE(u.current_longitude, bb.centroid_lon, $6::double precision) IS NULL
              THEN NULL
              ELSE 6371 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(COALESCE(u.current_latitude, bb.centroid_lat, $5::double precision) - $3) / 2), 2) +
                COS(RADIANS($3)) * COS(RADIANS(COALESCE(u.current_latitude, bb.centroid_lat, $5::double precision))) *
                POWER(SIN(RADIANS(COALESCE(u.current_longitude, bb.centroid_lon, $6::double precision) - $4) / 2), 2)
              ))
            END AS distance_km
     FROM users u
     LEFT JOIN barangay_boundaries bb
       ON $2 = 'barangay_rescuer' AND LOWER(bb.barangay_name) = LOWER(u.barangay_name)
     WHERE u.role = $2 AND COALESCE(u.is_archived, FALSE) = FALSE
       AND ($1::text IS NULL OR LOWER(u.barangay_name) = LOWER($1))
       AND NOT EXISTS (
         SELECT 1 FROM backup_requests active
         WHERE active.assigned_rescuer_id = u.id
           AND active.arrived_at IS NULL AND active.declined_at IS NULL
           AND active.id <> $7
       )
     ORDER BY distance_km ASC NULLS LAST, u.location_updated_at DESC NULLS LAST, u.id
     ${lock ? 'FOR UPDATE OF u SKIP LOCKED' : ''}
     LIMIT 1`,
    [
      dispatchType === 'barangay_responder' ? barangayName : null,
      config.role,
      Number(latitude),
      Number(longitude),
      fallbackLatitude,
      fallbackLongitude,
      Number(excludeDispatchId) || 0,
    ],
  );
  const rescuer = rows[0];
  if (!rescuer) return null;
  return {
    rescuerId: Number(rescuer.id),
    distanceKm: rescuer.distance_km == null ? null : Number(rescuer.distance_km),
    isOnline: Boolean(rescuer.is_online),
    dispatchLatitude: rescuer.dispatch_latitude == null ? null : Number(rescuer.dispatch_latitude),
    dispatchLongitude: rescuer.dispatch_longitude == null ? null : Number(rescuer.dispatch_longitude),
    ...buildAssignment(rescuer, { barangay_name: barangayName }, config),
  };
}

async function assignNearestAvailableRescuer(client, dispatchId, dispatchType, changedBy) {
  const config = dispatchConfig(dispatchType);
  const id = Number(dispatchId);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Invalid rescue dispatch.');

  // Serialize assignment decisions so two simultaneous acceptances cannot pick
  // the same responder before either transaction commits.
  await client.query('SELECT pg_advisory_xact_lock($1)', [880022]);

  const dispatchResult = await client.query(
    `SELECT br.id, br.report_id, br.barangay_name, br.assigned_rescuer_id, br.assigned_at,
            ir.status, ir.reported_by, ir.report_code, ir.latitude, ir.longitude
     FROM backup_requests br
     JOIN incident_reports ir ON ir.id = br.report_id
     WHERE br.id = $1 AND br.dispatch_type = $2
       AND br.arrived_at IS NULL AND br.declined_at IS NULL
     FOR UPDATE OF br, ir`,
    [id, dispatchType],
  );
  const dispatch = dispatchResult.rows[0];
  if (!dispatch) throw httpError(404, 'This rescue dispatch is no longer active.');

  if (dispatch.assigned_rescuer_id) {
    const existing = await client.query(
      `SELECT id, username, first_name, last_name, created_at
       FROM users WHERE id = $1`,
      [dispatch.assigned_rescuer_id],
    );
    return existing.rows[0] ? {
      dispatch_id: dispatch.id,
      report_id: dispatch.report_id,
      assigned_rescuer_id: dispatch.assigned_rescuer_id,
      assigned_at: dispatch.assigned_at,
      ...buildAssignment(existing.rows[0], dispatch, config),
    } : null;
  }

  const assignment = await findNearestAvailableRescuer(client, {
    dispatchType,
    barangayName: dispatch.barangay_name,
    latitude: dispatch.latitude,
    longitude: dispatch.longitude,
    excludeDispatchId: id,
    lock: true,
  });
  if (!assignment) throw httpError(409, config.unavailableMessage, 'NO_AVAILABLE_RESCUER');
  const updatedDispatch = await client.query(
    `UPDATE backup_requests
     SET assigned_rescuer_id = $2, assigned_at = NOW()
     WHERE id = $1 AND assigned_rescuer_id IS NULL
     RETURNING id AS dispatch_id, report_id, assigned_rescuer_id, assigned_at`,
    [id, assignment.rescuerId],
  );
  if (!updatedDispatch.rows[0]) throw httpError(409, 'A responder was already assigned to this rescue.');

  // Assignment means the responder is dispatched. The report remains Accepted
  // until proximity detection confirms the responder has reached the resident.
  await client.query(
    `UPDATE incident_reports
     SET assigned_team = $2, dispatched_at = COALESCE(dispatched_at, NOW()),
         updated_at = NOW(), updated_by = $3
     WHERE id = $1`,
    [dispatch.report_id, assignment.teamLabel, changedBy || null],
  );
  await client.query(
    `INSERT INTO report_status_logs
       (report_id, old_status, new_status, changed_by, action_note, metadata)
     VALUES ($1, $2, $2, $3, $4, $5::jsonb)`,
    [
      dispatch.report_id,
      dispatch.status,
      changedBy || null,
      config.assignmentNote,
      JSON.stringify({
        dispatchId: id,
        dispatchType,
        rescuerId: assignment.rescuerId,
        teamLabel: assignment.teamLabel,
        distanceKm: assignment.distanceKm,
      }),
    ],
  );
  await client.query(
    `INSERT INTO user_notifications (user_id, report_id, title, body)
     VALUES ($1, $2, $3, $4)`,
    [
      dispatch.reported_by,
      dispatch.report_id,
      `Report ${dispatch.report_code || dispatch.report_id} updated`,
      `${assignment.rescuerName}, your ${config.teamPrefix}, was assigned and is awaiting dispatch acknowledgment.`,
    ],
  );

  return { ...updatedDispatch.rows[0], ...assignment };
}

function buildAssignment(rescuer, dispatch, config) {
  const displayName = [rescuer.first_name, rescuer.last_name].filter(Boolean).join(' ') || rescuer.username;
  const accountId = `${config.accountPrefix}-${new Date(rescuer.created_at).getFullYear()}-${String(rescuer.id).padStart(5, '0')}`;
  const jurisdiction = config.role === 'barangay_rescuer' ? ` (${dispatch.barangay_name})` : '';
  return {
    rescuerName: displayName,
    rescuerAccountId: accountId,
    teamLabel: `${config.teamPrefix}${jurisdiction} - ${displayName} (${accountId})`,
  };
}

module.exports = { assignNearestAvailableRescuer, findNearestAvailableRescuer };
