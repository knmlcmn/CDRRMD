const pool = require('../config/db');
const { httpError } = require('../utils/httpError');

const PRESENCE_TTL_MS = 45_000;
const FUTURE_TOLERANCE_MS = 5_000;

function liveLocationSql(alias = 'u') {
  return `(
    COALESCE(${alias}.is_active, FALSE) = TRUE
    AND ${alias}.last_seen_at >= NOW() - INTERVAL '45 seconds'
    AND ${alias}.location_updated_at >= NOW() - INTERVAL '45 seconds'
    AND ${alias}.current_latitude BETWEEN -90 AND 90
    AND ${alias}.current_longitude BETWEEN -180 AND 180
  )`;
}

function isFreshValidResponder(row, now = Date.now()) {
  const lastSeenAt = Date.parse(String(row?.last_seen_at || ''));
  const locationUpdatedAt = Date.parse(String(row?.location_updated_at || ''));
  const latitude = Number(row?.current_latitude);
  const longitude = Number(row?.current_longitude);
  return row?.is_active === true
    && Number.isFinite(lastSeenAt) && now - lastSeenAt >= -FUTURE_TOLERANCE_MS && now - lastSeenAt <= PRESENCE_TTL_MS
    && Number.isFinite(locationUpdatedAt) && now - locationUpdatedAt >= -FUTURE_TOLERANCE_MS && now - locationUpdatedAt <= PRESENCE_TTL_MS
    && row?.current_latitude !== null && row?.current_latitude !== ''
    && row?.current_longitude !== null && row?.current_longitude !== ''
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function isInActorScope(row, scope) {
  if (scope.citywide) return row?.role === 'rescuer' || row?.role === 'barangay_rescuer';
  return row?.role === 'barangay_rescuer'
    && String(row?.barangay_name || '').toLowerCase() === scope.barangayName.toLowerCase();
}

function serializeLiveResponder(row) {
  return {
    id: row.id,
    rescuer_id: row.rescuer_id,
    first_name: row.first_name,
    last_name: row.last_name,
    barangay_name: row.barangay_name,
    current_latitude: row.current_latitude,
    current_longitude: row.current_longitude,
    location_updated_at: row.location_updated_at,
    is_online: true,
    is_available: row.is_available !== false,
    kind: row.role === 'rescuer' ? 'cddrmd' : 'barangay',
  };
}

async function resolveActorScope(actor, query) {
  if (actor?.role === 'admin') return { citywide: true, barangayName: null };
  if (actor?.role !== 'barangay' || !Number.isSafeInteger(Number(actor.userId))) {
    throw httpError(403, 'Admin or barangay access required.');
  }
  const { rows } = await query(
    `SELECT barangay_name
     FROM users
     WHERE id = $1 AND role = 'barangay' AND COALESCE(is_archived, FALSE) = FALSE
     LIMIT 1`,
    [Number(actor.userId)],
  );
  const barangayName = String(rows[0]?.barangay_name || '').trim();
  if (!barangayName) throw httpError(403, 'No barangay is assigned to this account.');
  return { citywide: false, barangayName };
}

async function listVisibleLiveRescuers(actor, options = {}) {
  const query = options.query || pool.query.bind(pool);
  const now = options.now ?? Date.now();
  const scope = await resolveActorScope(actor, query);
  const { rows } = await query(
    `SELECT u.id,
            CONCAT(CASE WHEN u.role = 'rescuer' THEN 'RSC' ELSE 'BRS' END,
              '-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0')) AS rescuer_id,
            u.first_name, u.last_name, u.barangay_name, u.role,
            u.current_latitude, u.current_longitude, u.location_updated_at,
            u.last_seen_at, COALESCE(u.is_active, FALSE) AS is_active,
            NOT EXISTS (
              SELECT 1 FROM backup_requests br
              WHERE br.assigned_rescuer_id = u.id AND br.arrived_at IS NULL AND br.declined_at IS NULL
            ) AS is_available
     FROM users u
     WHERE u.role IN ('rescuer', 'barangay_rescuer')
       AND COALESCE(u.is_archived, FALSE) = FALSE
       AND ${liveLocationSql('u')}
       AND ($1::text IS NULL OR (u.role = 'barangay_rescuer' AND LOWER(u.barangay_name) = LOWER($1)))
     ORDER BY u.id`,
    [scope.barangayName],
  );
  return rows
    .filter((row) => isInActorScope(row, scope) && isFreshValidResponder(row, now))
    .map(serializeLiveResponder);
}

module.exports = {
  PRESENCE_TTL_MS,
  FUTURE_TOLERANCE_MS,
  isFreshValidResponder,
  liveLocationSql,
  listVisibleLiveRescuers,
};
