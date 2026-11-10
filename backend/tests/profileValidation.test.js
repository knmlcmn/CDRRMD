const assert = require('node:assert/strict');
const test = require('node:test');

const authController = require('../src/controllers/authController');
const authService = require('../src/services/authService');
const userModel = require('../src/models/userModel');
const { validateProfileUpdate } = require('../src/services/profileValidation');

const originalModelMethods = {
  findPublicUserById: userModel.findPublicUserById,
  findDuplicateEmailForUser: userModel.findDuplicateEmailForUser,
  updateMyProfile: userModel.updateMyProfile,
  findUserByEmail: userModel.findUserByEmail,
};

test.afterEach(() => {
  Object.assign(userModel, originalModelMethods);
});

function account(role = 'user', overrides = {}) {
  return {
    id: 42,
    username: 'account-42',
    role,
    email: 'juan@example.com',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    address: 'Barangay Palingon, Calamba City',
    contact_number: '09171234567',
    profile_image: 'data:image/png;base64,OLDIMAGE',
    barangay_name: 'Palingon',
    created_at: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function mockProfileDatabase(current) {
  const calls = { duplicateEmails: [], updates: [] };
  userModel.findPublicUserById = async () => current;
  userModel.findDuplicateEmailForUser = async (email, userId) => {
    calls.duplicateEmails.push({ email, userId });
    return null;
  };
  userModel.updateMyProfile = async (userId, profile) => {
    calls.updates.push({ userId, profile });
    return {
      ...current,
      first_name: profile.firstName,
      last_name: profile.lastName,
      email: profile.email,
      address: profile.address,
      contact_number: profile.contactNumber,
      profile_image: profile.profileImage === undefined ? current.profile_image : profile.profileImage,
    };
  };
  return calls;
}

test('resident updates reject explicitly supplied null, blank, and whitespace required fields', async () => {
  for (const field of ['firstName', 'lastName', 'email', 'address']) {
    for (const value of [null, '', '   \t ']) {
      const calls = mockProfileDatabase(account());
      await assert.rejects(
        authService.updateMe(42, { [field]: value }),
        (error) => error.status === 400
          && error.code === 'PROFILE_VALIDATION_FAILED'
          && error.field === field
          && /required/i.test(error.message),
      );
      assert.equal(calls.updates.length, 0);
    }
  }
});

test('resident partial updates normalize supplied fields and preserve omitted profile values', async () => {
  const current = account('user', { contact_number: '' });
  const calls = mockProfileDatabase(current);

  await authService.updateMe(current.id, { firstName: '  Maria  ' });

  assert.deepEqual(calls.updates[0], {
    userId: current.id,
    profile: {
      firstName: 'Maria',
      lastName: current.last_name,
      email: current.email,
      address: current.address,
      contactNumber: '',
      profileImage: undefined,
    },
  });
});

test('image-only updates preserve legacy blank profile fields and unrelated account identity', async () => {
  const current = account('user', {
    first_name: null,
    last_name: null,
    address: null,
    contact_number: null,
  });
  const calls = mockProfileDatabase(current);
  const profileImage = 'data:image/png;base64,AAAA';

  const response = await authService.updateMe(current.id, { profileImage });

  assert.deepEqual(calls.updates[0].profile, {
    firstName: null,
    lastName: null,
    email: current.email,
    address: null,
    contactNumber: null,
    profileImage,
  });
  assert.equal(response.user.username, current.username);
  assert.equal(response.user.role, current.role);
  assert.equal(response.user.barangayName, current.barangay_name);
  assert.equal(response.user.profileImage, profileImage);
  assert.equal(Object.hasOwn(calls.updates[0].profile, 'passwordHash'), false);
});

test('legacy residents can update an unrelated optional field without completing missing required fields', async () => {
  const current = account('user', { first_name: null, last_name: null, address: null, contact_number: null });
  const calls = mockProfileDatabase(current);

  await authService.updateMe(current.id, { contactNumber: ' 09170000000 ' });

  assert.equal(calls.updates[0].profile.contactNumber, '09170000000');
  assert.equal(calls.updates[0].profile.firstName, null);
  assert.equal(calls.updates[0].profile.address, null);
});

test('staff roles retain optional name, address, contact, and formatted-contact behavior', async () => {
  for (const role of ['rescuer', 'barangay_rescuer', 'barangay', 'admin']) {
    const current = account(role, { address: null, contact_number: null });
    const calls = mockProfileDatabase(current);

    await authService.updateMe(current.id, {
      firstName: ' ',
      lastName: null,
      email: ' STAFF@EXAMPLE.COM ',
      address: '',
      contactNumber: ' +63 917 123 4567 ',
    });

    assert.deepEqual(calls.updates[0].profile, {
      firstName: null,
      lastName: null,
      email: 'staff@example.com',
      address: null,
      contactNumber: '+63 917 123 4567',
      profileImage: undefined,
    });
  }
});

test('controller returns a valid normalized resident update and backend field errors remain structured', async () => {
  const current = account();
  const calls = mockProfileDatabase(current);
  const responseState = { status: 200, body: null };
  const res = {
    status(value) { responseState.status = value; return this; },
    json(value) { responseState.body = value; return value; },
  };

  await authController.updateMe({
    user: { userId: current.id, role: 'user' },
    body: {
      firstName: '  Maria ',
      lastName: ' Santos  ',
      email: ' MARIA@EXAMPLE.COM ',
      address: '  Barangay Lingga ',
      contactNumber: ' 09175550000 ',
    },
  }, res);

  assert.equal(responseState.status, 200);
  assert.equal(responseState.body.user.firstName, 'Maria');
  assert.deepEqual(calls.updates[0].profile, {
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria@example.com',
    address: 'Barangay Lingga',
    contactNumber: '09175550000',
    profileImage: undefined,
  });

  const invalid = validateProfileUpdate({ firstName: '   ' }, current);
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.errors.firstName, 'First name is required.');
});

test('resident registration rejects blank first or last names before database access', async () => {
  let databaseCalls = 0;
  userModel.findUserByEmail = async () => {
    databaseCalls += 1;
    return null;
  };
  const registration = {
    email: 'resident@example.com',
    password: 'secret1',
    firstName: 'Resident',
    lastName: 'User',
    houseNumber: '1',
    streetAddress: 'Main Street',
    barangayName: 'Palingon',
    otp: '123456',
  };

  for (const patch of [{ firstName: '' }, { firstName: '  ' }, { firstName: null }, { lastName: '' }, { lastName: ' \t ' }, { lastName: null }]) {
    await assert.rejects(
      authService.register({ ...registration, ...patch }),
      (error) => error.status === 400 && /first name and last name are required/i.test(error.message),
    );
  }
  assert.equal(databaseCalls, 0);
});
