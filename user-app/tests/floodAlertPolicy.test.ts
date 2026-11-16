import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acknowledgeFloodEvent,
  isFloodEventAcknowledged,
  isNotificationNewerThanAcknowledgement,
  isNotificationRelevantToResident,
  liveFloodEventKey,
  selectEligibleFloodNotifications,
} from '../src/components/floodAlertPolicy.ts';

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    category: 'flood_sensor',
    severity: 'high',
    barangay_name: 'Palingon',
    source_event_key: 'event-1',
    read_at: null,
    ...overrides,
  };
}

test('unrelated barangay notifications cannot open the resident alert', () => {
  const eligible = selectEligibleFloodNotifications({
    notifications: [notification({ barangay_name: 'Parian' })],
    residentBarangay: 'Palingon',
    suppressedIds: new Set<number>(),
    acknowledgements: new Map(),
  });
  assert.equal(eligible.length, 0);
});

test('an explicit current-location mismatch overrides a profile barangay match', () => {
  assert.equal(isNotificationRelevantToResident(
    notification({ barangay_name: 'Palingon', matches_current_location: false }),
    'Palingon',
  ), false);
});

test('an acknowledged unchanged event does not reopen', () => {
  const acknowledgements = new Map();
  acknowledgeFloodEvent(acknowledgements, 'notification:event-1', 'high');
  const eligible = selectEligibleFloodNotifications({
    notifications: [notification()],
    residentBarangay: 'Palingon',
    suppressedIds: new Set<number>(),
    acknowledgements,
  });
  assert.equal(eligible.length, 0);
});

test('acknowledgement leaves no blocking alert candidate so navigation can resume', () => {
  const acknowledgements = new Map();
  acknowledgeFloodEvent(acknowledgements, 'live:waterSensor1', 'high');
  assert.equal(isFloodEventAcknowledged(
    acknowledgements,
    'live:waterSensor1',
    'high',
  ), true);
  assert.equal(selectEligibleFloodNotifications({
    notifications: [],
    residentBarangay: 'Palingon',
    suppressedIds: new Set<number>(),
    acknowledgements,
  }).length, 0);
});

test('a new relevant emergency still triggers', () => {
  const acknowledgements = new Map();
  acknowledgeFloodEvent(acknowledgements, 'notification:event-1', 'high');
  const eligible = selectEligibleFloodNotifications({
    notifications: [notification({ id: 2, source_event_key: 'event-2' })],
    residentBarangay: 'Palingon',
    suppressedIds: new Set<number>(),
    acknowledgements,
  });
  assert.equal(eligible.length, 1);
});

test('severity escalation re-alerts but unchanged or lower severity does not', () => {
  const acknowledgements = new Map();
  const eventKey = liveFloodEventKey('waterSensor1');
  acknowledgeFloodEvent(acknowledgements, eventKey, 'moderate');
  assert.equal(isFloodEventAcknowledged(acknowledgements, eventKey, 'moderate'), true);
  assert.equal(isFloodEventAcknowledged(acknowledgements, eventKey, 'high'), false);
  acknowledgeFloodEvent(acknowledgements, eventKey, 'high');
  assert.equal(isFloodEventAcknowledged(acknowledgements, eventKey, 'moderate'), true);
  assert.equal(isFloodEventAcknowledged(acknowledgements, eventKey, 'high'), true);
});

test('a delayed notification copy is suppressed but a later event is allowed', () => {
  const acknowledgedAt = 2_000_000_000_000;
  assert.equal(isNotificationNewerThanAcknowledgement(
    notification({ source_event_key: 'waterSensor1-1999999999000' }),
    acknowledgedAt,
  ), false);
  assert.equal(isNotificationNewerThanAcknowledgement(
    notification({ source_event_key: 'waterSensor1-2000000001000' }),
    acknowledgedAt,
  ), true);
});

test('missing profile location accepts only an explicit server coverage match', () => {
  assert.equal(isNotificationRelevantToResident(
    notification({ matches_current_location: true }),
    '',
  ), true);
  assert.equal(isNotificationRelevantToResident(
    notification({ matches_current_location: undefined }),
    '',
  ), false);
});
