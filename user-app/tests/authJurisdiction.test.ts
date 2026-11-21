import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAuthoritativeJurisdiction } from '../src/services/authJurisdiction.ts';

const currentUser = {
  id: 7,
  username: 'resident',
  role: 'user',
  barangayName: 'Palingon',
};

test('current GPS jurisdiction overrides nested registration barangay', () => {
  const user = applyAuthoritativeJurisdiction(currentUser, {
    user: { ...currentUser, barangayName: 'Palingon' },
    barangayName: 'Lingga',
  });

  assert.equal(user.barangayName, 'Lingga');
});

test('location assignment fails closed without an authoritative jurisdiction', () => {
  assert.throws(
    () => applyAuthoritativeJurisdiction(currentUser, { user: currentUser }),
    /current activity barangay could not be determined/i,
  );
});
