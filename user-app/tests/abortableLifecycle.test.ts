import assert from 'node:assert/strict';
import test from 'node:test';
import { createAbortableLifecycle } from '../src/utils/abortableLifecycle.ts';

test('repeated open/cancel/reopen leaves only the latest SOS lifecycle active', () => {
  const lifecycle = createAbortableLifecycle();
  const attempts = Array.from({ length: 5 }, () => lifecycle.begin(60_000));

  attempts.slice(0, -1).forEach((attempt) => {
    assert.equal(attempt.signal.aborted, true);
    assert.equal(attempt.isCurrent(), false);
  });
  assert.equal(attempts.at(-1)?.signal.aborted, false);
  assert.equal(attempts.at(-1)?.isCurrent(), true);

  lifecycle.cancel();
  assert.equal(attempts.at(-1)?.signal.aborted, true);
  assert.equal(lifecycle.hasActive(), false);
});

test('an obsolete callback cannot finish or commit over the replacement lifecycle', () => {
  const lifecycle = createAbortableLifecycle();
  const obsolete = lifecycle.begin(60_000);
  const current = lifecycle.begin(60_000);
  const committed: string[] = [];

  if (obsolete.isCurrent()) committed.push('obsolete');
  obsolete.finish();
  assert.equal(current.isCurrent(), true, 'a stale finish must not clear the current attempt');
  if (current.isCurrent()) committed.push('current');

  assert.deepEqual(committed, ['current']);
  current.finish();
  assert.equal(lifecycle.hasActive(), false);
});
