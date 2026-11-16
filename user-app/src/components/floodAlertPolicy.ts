export type FloodSeverity = 'moderate' | 'high';

export type FloodAlertNotification = {
  id: number | null;
  category?: string;
  severity?: string;
  barangay_name?: string | null;
  source_event_key?: string | null;
  read_at?: string | null;
  matches_current_location?: boolean;
};

export type EventAcknowledgement = { rank: number; acknowledgedAt: number };
export type EventAcknowledgements = Map<string, EventAcknowledgement>;

export function normalizeBarangayName(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^barangay\s+/, '');
}

export function normalizeFloodSeverity(value: unknown): FloodSeverity | null {
  const severity = String(value || '').toLowerCase();
  return severity === 'moderate' || severity === 'high' ? severity : null;
}

export function severityRank(severity: FloodSeverity) {
  return severity === 'high' ? 2 : 1;
}

export function liveFloodEventKey(sensorId: string) {
  return `live:${sensorId}`;
}

export function notificationFloodEventKey(notification: FloodAlertNotification) {
  const sourceKey = String(notification.source_event_key || '').trim();
  if (sourceKey) return `notification:${sourceKey}`;
  return notification.id === null ? null : `notification-id:${notification.id}`;
}

export function acknowledgeFloodEvent(
  acknowledgements: EventAcknowledgements,
  eventKey: string | null | undefined,
  severity: FloodSeverity | null,
  acknowledgedAt = Date.now(),
) {
  if (!eventKey || !severity) return;
  const nextRank = severityRank(severity);
  const current = acknowledgements.get(eventKey);
  if (!current || nextRank > current.rank) {
    acknowledgements.set(eventKey, { rank: nextRank, acknowledgedAt });
  }
}

export function isFloodEventAcknowledged(
  acknowledgements: EventAcknowledgements,
  eventKey: string | null | undefined,
  severity: FloodSeverity | null,
) {
  return Boolean(eventKey && severity && (acknowledgements.get(eventKey)?.rank || 0) >= severityRank(severity));
}

export function floodEventAcknowledgedAt(
  acknowledgements: EventAcknowledgements,
  eventKey: string | null | undefined,
) {
  return eventKey ? acknowledgements.get(eventKey)?.acknowledgedAt ?? null : null;
}

export function notificationEventStartedAt(notification: FloodAlertNotification) {
  const match = String(notification.source_event_key || '').match(/-(\d{10,})$/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isNotificationNewerThanAcknowledgement(
  notification: FloodAlertNotification,
  acknowledgedAt: number | null,
) {
  if (acknowledgedAt === null) return true;
  const eventStartedAt = notificationEventStartedAt(notification);
  // Unknown/legacy keys cannot prove a new event, so prefer preventing the
  // blocking modal from reopening for a delayed copy of the current alert.
  return eventStartedAt !== null && eventStartedAt > acknowledgedAt;
}

/**
 * Location policy:
 * - An explicit backend location mismatch always wins and is excluded.
 * - An explicit backend match is accepted because it may represent current GPS
 *   coverage even when the stored profile barangay is missing or stale.
 * - Without an explicit location result, a profile-barangay name match is
 *   required. If neither signal exists, the client does not guess a barangay.
 *
 * The final case intentionally waits for a server-confirmed location match. It
 * avoids presenting a random area's blocking emergency modal while GPS/profile
 * verification is incomplete, without suppressing notifications the server has
 * positively matched to current location coverage.
 */
export function isNotificationRelevantToResident(
  notification: FloodAlertNotification,
  residentBarangay: string | null | undefined,
) {
  if (notification.matches_current_location === false) return false;
  if (notification.matches_current_location === true) return true;

  const residentKey = normalizeBarangayName(residentBarangay);
  const notificationKey = normalizeBarangayName(notification.barangay_name);
  return Boolean(residentKey && notificationKey && residentKey === notificationKey);
}

export function selectEligibleFloodNotifications({
  notifications,
  residentBarangay,
  suppressedIds,
  acknowledgements,
}: {
  notifications: FloodAlertNotification[];
  residentBarangay?: string | null;
  suppressedIds: ReadonlySet<number>;
  acknowledgements: EventAcknowledgements;
}) {
  return notifications.filter((notification) => {
    if (String(notification.category || '').toLowerCase() !== 'flood_sensor') return false;
    if (notification.read_at || notification.id === null || suppressedIds.has(notification.id)) return false;
    if (!isNotificationRelevantToResident(notification, residentBarangay)) return false;
    const severity = normalizeFloodSeverity(notification.severity);
    return severity !== null
      && !isFloodEventAcknowledged(acknowledgements, notificationFloodEventKey(notification), severity);
  });
}
