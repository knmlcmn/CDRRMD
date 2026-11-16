import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateEditableProfile } from '../src/utils/profileValidation.ts';

const validProfile = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  address: 'Barangay Palingon, Calamba City',
  contactNumber: '09171234567',
};

test('null, blank, and whitespace-only required profile fields receive field-specific errors', () => {
  for (const field of ['firstName', 'lastName', 'email', 'address'] as const) {
    for (const value of [null, '', '   \t ']) {
      const result = validateEditableProfile({ ...validProfile, [field]: value });
      assert.equal(result.isValid, false);
      assert.match(result.errors[field] || '', /required/i);
    }
  }
});

test('a valid profile update is trimmed and normalized while contact number stays optional', () => {
  const result = validateEditableProfile({
    firstName: '  Juan  ',
    lastName: '  Dela Cruz ',
    email: '  JUAN@EXAMPLE.COM ',
    address: '  Barangay Palingon, Calamba City  ',
    contactNumber: '   ',
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.profile, {
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan@example.com',
    address: 'Barangay Palingon, Calamba City',
    contactNumber: '',
  });
});

test('Me Screen returns before its update request when profile validation fails', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(here, '../src/screens/MeScreen.tsx'), 'utf8');
  const validationIndex = source.indexOf('const validation = validateEditableProfile(draftProfile);');
  const earlyReturnIndex = source.indexOf('if (!validation.isValid) return;', validationIndex);
  const requestIndex = source.indexOf('await putAuthMe(validation.profile);', earlyReturnIndex);

  assert.ok(validationIndex >= 0);
  assert.ok(earlyReturnIndex > validationIndex);
  assert.ok(requestIndex > earlyReturnIndex);
});
