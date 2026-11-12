const HEARTBEAT_TTL_SECONDS = 45;
const LOCATION_TTL_SECONDS = 45;
const RESPONDER_ROLES = new Set(['rescuer', 'barangay_rescuer']);

function hasValidSessionSql(alias = 'u') {
  return `EXISTS (
    SELECT 1 FROM user_refresh_tokens presence_session
    WHERE presence_session.user_id = ${alias}.id
      AND presence_session.revoked_at IS NULL
      AND presence_session.expires_at > NOW()
  )`;
}

function hasBoundSessionSql(alias, sessionHashParameter) {
  return `EXISTS (
    SELECT 1 FROM user_refresh_tokens presence_session
    WHERE presence_session.user_id = ${alias}.id
      AND presence_session.revoked_at IS NULL
      AND presence_session.expires_at > NOW()
      AND ${sessionHashParameter}::text IS NOT NULL
      AND presence_session.token_hash = ${sessionHashParameter}::text
  )`;
}

function hasActivePresenceSql(alias = 'u') {
  return `(
    ${alias}.role IN ('rescuer', 'barangay_rescuer')
    AND COALESCE(${alias}.is_archived, FALSE) = FALSE
    AND COALESCE(${alias}.is_active, FALSE) = TRUE
    AND ${alias}.last_seen_at >= NOW() - INTERVAL '${HEARTBEAT_TTL_SECONDS} seconds'
    AND ${hasValidSessionSql(alias)}
  )`;
}

function hasLiveLocationSql(alias = 'u') {
  return `(
    ${hasActivePresenceSql(alias)}
    AND ${alias}.location_updated_at >= NOW() - INTERVAL '${LOCATION_TTL_SECONDS} seconds'
    AND ${alias}.current_latitude BETWEEN -90 AND 90
    AND ${alias}.current_longitude BETWEEN -180 AND 180
  )`;
}

function isLiveResponder(record, now = Date.now()) {
  if (!record || !RESPONDER_ROLES.has(record.role) || record.isArchived || !record.isActive || !record.hasValidSession) {
    return false;
  }
  const lastSeenAt = new Date(record.lastSeenAt).getTime();
  const locationUpdatedAt = new Date(record.locationUpdatedAt).getTime();
  if (record.latitude === null || record.latitude === undefined || record.latitude === ''
    || record.longitude === null || record.longitude === undefined || record.longitude === '') {
    return false;
  }
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  return Number.isFinite(lastSeenAt)
    && now >= lastSeenAt && now - lastSeenAt <= HEARTBEAT_TTL_SECONDS * 1000
    && Number.isFinite(locationUpdatedAt)
    && now >= locationUpdatedAt && now - locationUpdatedAt <= LOCATION_TTL_SECONDS * 1000
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

module.exports = {
  HEARTBEAT_TTL_SECONDS,
  LOCATION_TTL_SECONDS,
  hasValidSessionSql,
  hasBoundSessionSql,
  hasActivePresenceSql,
  hasLiveLocationSql,
  isLiveResponder,
};
