const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const refreshTokenModel = require('../models/refreshTokenModel');
const {
  REFRESH_EXPIRES_IN,
  parseExpiresInToDate,
  hashRefreshToken,
  issueTokens,
  verifyRefreshToken,
} = require('../utils/authTokens');
const { httpError } = require('../utils/httpError');
const { SUPPORTED_BARANGAYS: RESIDENT_BARANGAYS, normalizeBarangayName } = require('./supportedBarangays');
const { resolveBarangayAtLocation } = require('./barangayBoundaryService');
const emailOtpService = require('./emailOtpService');

// Keeps API response shape stable even if DB column names differ.
function toUserResponse(user) {
  const accountPrefix = user.role === 'admin' ? 'ADM' : user.role === 'barangay' ? 'BRG' : user.role === 'rescuer' ? 'RSC' : user.role === 'barangay_rescuer' ? 'BRS' : user.role === 'user' ? 'USR' : null;
  const createdYear = user.created_at ? new Date(user.created_at).getFullYear() : null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    address: user.address,
    contactNumber: user.contact_number,
    profileImage: user.profile_image || null,
    barangayName: user.barangay_name || null,
    accountId: accountPrefix && createdYear ? `${accountPrefix}-${createdYear}-${String(user.id).padStart(5, '0')}` : null,
  };
}

async function persistRefreshToken(client, userId, refreshToken) {
  // Persist only a hash of the refresh token for safer storage.
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = parseExpiresInToDate(REFRESH_EXPIRES_IN);
  await refreshTokenModel.insertRefreshToken(client, userId, refreshTokenHash, expiresAt);
}

async function register(payload) {
  const { username, email, password, firstName, lastName, address, houseNumber, streetAddress, barangayName, contactNumber, otp } = payload || {};

  if (!email || !password) {
    throw httpError(400, 'Email and password are required.');
  }

  const trimmedEmail = emailOtpService.normalizeEmail(email);

  if (String(password).length < 6) {
    throw httpError(400, 'Password must be at least 6 characters.');
  }

  const selectedBarangay = RESIDENT_BARANGAYS.find(
    (name) => normalizeBarangayName(name) === normalizeBarangayName(barangayName),
  );
  if (!selectedBarangay) {
    throw httpError(400, 'Please select one of the six supported barangays.');
  }

  const normalizedContactNumber = String(contactNumber || '').trim();
  if (normalizedContactNumber && !/^\d+$/.test(normalizedContactNumber)) {
    throw httpError(400, 'Contact number must contain numbers only.');
  }

  const structuredAddress = [String(houseNumber || '').trim(), String(streetAddress || '').trim()]
    .filter(Boolean)
    .join(' ');
  const finalAddress = structuredAddress || String(address || '').trim();
  if (!finalAddress) {
    throw httpError(400, 'House number and street address are required.');
  }

  const existing = await userModel.findUserByEmail(trimmedEmail);
  if (existing) {
    throw httpError(409, 'Email already exists.');
  }

  await emailOtpService.verifyCode(trimmedEmail, 'registration', otp);

  const rawUsername = String(username || '').trim();
  const finalUsername = rawUsername.length > 0 ? rawUsername : trimmedEmail.split('@')[0];
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userModel.createUser({
    username: finalUsername,
    email: trimmedEmail,
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    address: finalAddress,
    contactNumber: normalizedContactNumber || null,
    passwordHash,
    role: 'user',
    barangayName: selectedBarangay,
  });

  const { token, refreshToken } = issueTokens(user);
  await refreshTokenModel.withTransaction(async (client) => {
    await refreshTokenModel.revokeActiveByUser(client, user.id);
    await persistRefreshToken(client, user.id, refreshToken);
  });

  return { token, refreshToken, user: toUserResponse(user) };
}

async function requestRegistrationOtp(payload) {
  const email = emailOtpService.normalizeEmail(payload?.email);
  const existing = await userModel.findUserByEmail(email);
  if (existing) throw httpError(409, 'Email already exists.');
  const result = await emailOtpService.sendCode(email, 'registration');
  return { message: 'A verification code was sent to your email.', ...result };
}

async function requestPasswordResetOtp(payload) {
  const email = emailOtpService.normalizeEmail(payload?.email);
  const user = await userModel.findUserByEmail(email);
  if (user?.role === 'user') {
    await emailOtpService.sendCode(email, 'password_reset');
  }
  return {
    message: 'If a resident account uses that email, a verification code has been sent.',
    expiresInSeconds: 600,
    resendAfterSeconds: 60,
  };
}

async function resetPassword(payload) {
  const email = emailOtpService.normalizeEmail(payload?.email);
  const newPassword = String(payload?.newPassword || '');
  if (newPassword.length < 6) throw httpError(400, 'Password must be at least 6 characters.');

  const user = await userModel.findUserByEmail(email);
  if (!user || user.role !== 'user') {
    throw httpError(400, 'The verification code is missing or expired. Request a new code.', 'INVALID_OTP');
  }
  await emailOtpService.verifyCode(email, 'password_reset', payload?.otp);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await refreshTokenModel.withTransaction(async (client) => {
    const updated = await userModel.updateUserPasswordById(user.id, passwordHash, client);
    if (!updated) throw httpError(404, 'User account not found.');
    await refreshTokenModel.revokeActiveByUser(client, user.id);
  });
  return { message: 'Your password has been reset. You can now log in.' };
}

async function login(payload) {
  const { email, username, accountId, portal, password } = payload || {};
  const staffRole = portal === 'admin'
    ? 'admin'
    : portal === 'barangay'
      ? 'barangay'
      : portal === 'rescuer'
        ? 'rescuer'
        : portal === 'barangay_rescuer'
          ? 'barangay_rescuer'
        : null;

  if (staffRole) {
    const normalizedAccountId = String(accountId || '').trim().toUpperCase();
    const expectedPattern = staffRole === 'admin'
      ? /^ADM-\d{4}-\d{5}$/
      : staffRole === 'barangay'
        ? /^BRG-\d{4}-\d{5}$/
        : staffRole === 'rescuer'
          ? /^RSC-\d{4}-\d{5}$/
          : /^BRS-\d{4}-\d{5}$/;
    if (!expectedPattern.test(normalizedAccountId) || !password) {
      throw httpError(401, 'Invalid account ID or password.');
    }
    const staffUser = await userModel.findStaffByAccountId(normalizedAccountId, staffRole);
    if (!staffUser || !staffUser.password_hash || !(await bcrypt.compare(password, staffUser.password_hash))) {
      throw httpError(401, 'Invalid account ID or password.');
    }
    return completeLogin(staffUser);
  }

  const identifier = email || username;

  if (!identifier || !password) {
    throw httpError(400, 'Username/email and password are required.');
  }

  const normalizedIdentifier = String(identifier).trim();
  if (!normalizedIdentifier) {
    throw httpError(400, 'Username/email and password are required.');
  }

  const lookupIdentifier = normalizedIdentifier.includes('@')
    ? normalizedIdentifier.toLowerCase()
    : normalizedIdentifier;

  let user = await userModel.findUserByEmail(lookupIdentifier);
  if (!user) {
    user = await userModel.findUserByUsername(lookupIdentifier);
  }

  if (!user || !user.password_hash || typeof user.password_hash !== 'string') {
    throw httpError(401, 'Invalid email or password.');
  }

  if (['admin', 'barangay', 'rescuer', 'barangay_rescuer'].includes(user.role)) {
    throw httpError(401, 'Staff accounts must log in with their account ID through the correct web portal.');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw httpError(401, 'Invalid email or password.');
  }

  return completeLogin(user);
}

async function completeLogin(user) {
  const { token, refreshToken } = issueTokens(user);

  await refreshTokenModel.withTransaction(async (client) => {
    await refreshTokenModel.revokeActiveByUser(client, user.id);
    await persistRefreshToken(client, user.id, refreshToken);
    await client.query(
      `UPDATE users
       SET last_login = NOW(),
           last_seen_at = NOW(),
           is_active = TRUE
       WHERE id = $1`,
      [user.id],
    );
  });

  return { token, refreshToken, user: toUserResponse(user) };
}

async function refresh(payload) {
  const refreshToken = String(payload?.refreshToken || '').trim();
  if (!refreshToken) {
    throw httpError(401, 'Refresh token is required.', 'AUTH_REFRESH_MISSING');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw httpError(401, 'Refresh token is invalid or expired.', 'AUTH_REFRESH_INVALID');
  }

  const userId = decoded?.userId;
  if (!userId) {
    throw httpError(401, 'Invalid refresh token payload.', 'AUTH_REFRESH_INVALID');
  }

  const tokenHash = hashRefreshToken(refreshToken);

  // Refresh flow validates the old token, revokes it, then issues a new pair.
  return refreshTokenModel.withTransaction(async (client) => {
    const tokenRow = await refreshTokenModel.findValidToken(client, userId, tokenHash);
    if (!tokenRow) {
      throw httpError(401, 'Refresh token is no longer valid.', 'AUTH_REFRESH_INVALID');
    }

    const user = await userModel.findPublicUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found.');
    }
    const nextTokens = issueTokens(user);
    await refreshTokenModel.revokeById(client, tokenRow.id);
    await persistRefreshToken(client, user.id, nextTokens.refreshToken);

    return {
      token: nextTokens.token,
      refreshToken: nextTokens.refreshToken,
      user: toUserResponse(user),
    };
  });
}

async function logout(userId) {
  if (!userId) {
    throw httpError(401, 'Invalid token payload.');
  }

  await refreshTokenModel.withTransaction(async (client) => {
    await refreshTokenModel.revokeActiveByUser(client, userId);
    await client.query(
      `UPDATE users SET is_active = FALSE, last_seen_at = NOW() WHERE id = $1`,
      [userId],
    );
  });
}

async function getMe(userId) {
  if (!userId) {
    throw httpError(401, 'Invalid token payload.');
  }

  const user = await userModel.findPublicUserById(userId);
  if (!user) {
    throw httpError(404, 'User not found.');
  }
  return { user: toUserResponse(user) };
}

async function updateMe(userId, payload) {
  if (!userId) {
    throw httpError(401, 'Invalid token payload.');
  }

  const { firstName, lastName, email, address, contactNumber, profileImage } = payload || {};
  const nextProfileImage = profileImage === undefined ? undefined : String(profileImage).trim();
  if (nextProfileImage !== undefined && (!/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(nextProfileImage) || nextProfileImage.length > 4 * 1024 * 1024)) {
    throw httpError(400, 'Please provide a valid profile image smaller than 3 MB.');
  }
  const nextEmail = String(email || '').trim().toLowerCase() || null;
  if (nextEmail && !nextEmail.includes('@')) {
    throw httpError(400, 'Please provide a valid email address.');
  }

  if (nextEmail) {
    const duplicate = await userModel.findDuplicateEmailForUser(nextEmail, userId);
    if (duplicate) {
      throw httpError(409, 'Email already exists.');
    }
  }

  const currentUser = await userModel.findPublicUserById(userId);
  if (!currentUser) {
    throw httpError(404, 'User not found.');
  }
  const user = await userModel.updateMyProfile(userId, {
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    email: nextEmail,
    address: String(address || '').trim() || null,
    contactNumber: String(contactNumber || '').trim() || null,
    profileImage: nextProfileImage,
  });

  if (!user) {
    throw httpError(404, 'User not found.');
  }

  return { user: toUserResponse(user) };
}

async function assignBarangayFromLocation(userId, payload) {
  if (!userId) {
    throw httpError(401, 'Invalid token payload.');
  }

  const currentUser = await userModel.findPublicUserById(userId);
  if (!currentUser) {
    throw httpError(404, 'User not found.');
  }
  if (currentUser.role !== 'user') {
    throw httpError(403, 'Resident account access required.');
  }

  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw httpError(400, 'A valid current location is required.');
  }

  const barangayName = RESIDENT_BARANGAYS.find(
    (name) => name.toLowerCase() === String(resolveBarangayAtLocation(latitude, longitude) || '').toLowerCase(),
  );
  if (!barangayName) {
    throw httpError(400, 'Your current location is outside the supported barangay jurisdiction.');
  }

  const user = await userModel.updateResidentLocation(
    userId,
    latitude,
    longitude,
    barangayName,
  );
  if (!user) {
    throw httpError(404, 'Resident account not found.');
  }

  // `user.barangayName` remains the account's registration information.
  // `barangayName` identifies the user's current activity jurisdiction.
  return { user: toUserResponse(user), barangayName };
}

module.exports = {
  register,
  requestRegistrationOtp,
  requestPasswordResetOtp,
  resetPassword,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  assignBarangayFromLocation,
};
