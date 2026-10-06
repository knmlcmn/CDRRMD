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
const { SUPPORTED_BARANGAYS: RESIDENT_BARANGAYS } = require('./supportedBarangays');
const { resolveNearbyBarangayAtLocation } = require('./barangayBoundaryService');

// Keeps API response shape stable even if DB column names differ.
function toUserResponse(user) {
  const accountPrefix = user.role === 'admin' ? 'ADM' : user.role === 'barangay' ? 'BRG' : user.role === 'rescuer' ? 'RSC' : user.role === 'barangay_rescuer' ? 'BRS' : null;
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
    barangayName: user.barangay_name || null,
    verificationStatus: user.verification_status || 'approved',
    accountId: accountPrefix && createdYear ? `${accountPrefix}-${createdYear}-${String(user.id).padStart(5, '0')}` : null,
  };
}

function normalizeValidIdImage(value) {
  const normalized = String(value || '').trim();
  if (!/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,[a-z0-9+/=\s]+$/i.test(normalized)) {
    throw httpError(400, 'A valid ID image is required for account verification.');
  }
  if (normalized.length > 10 * 1024 * 1024) {
    throw httpError(413, 'The valid ID image is too large. Please upload a smaller image.');
  }
  return normalized;
}

async function persistRefreshToken(client, userId, refreshToken) {
  // Persist only a hash of the refresh token for safer storage.
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = parseExpiresInToDate(REFRESH_EXPIRES_IN);
  await refreshTokenModel.insertRefreshToken(client, userId, refreshTokenHash, expiresAt);
}

async function register(payload) {
  const { username, email, password, firstName, lastName, address, contactNumber, validIdImage } = payload || {};

  if (!email || !password) {
    throw httpError(400, 'Email and password are required.');
  }

  const trimmedEmail = String(email).trim().toLowerCase();
  if (!trimmedEmail.includes('@')) {
    throw httpError(400, 'Please provide a valid email address.');
  }

  if (String(password).length < 6) {
    throw httpError(400, 'Password must be at least 6 characters.');
  }

  const normalizedValidId = normalizeValidIdImage(validIdImage);

  const existing = await userModel.findUserByEmail(trimmedEmail);
  if (existing) {
    throw httpError(409, 'Email already exists.');
  }

  const rawUsername = String(username || '').trim();
  const finalUsername = rawUsername.length > 0 ? rawUsername : trimmedEmail.split('@')[0];
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userModel.createUser({
    username: finalUsername,
    email: trimmedEmail,
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    address: String(address || '').trim() || null,
    contactNumber: String(contactNumber || '').trim() || null,
    passwordHash,
    role: 'user',
    barangayName: null,
    validIdImage: normalizedValidId,
    verificationStatus: 'pending',
  });

  const { token, refreshToken } = issueTokens(user);
  await refreshTokenModel.withTransaction(async (client) => {
    await refreshTokenModel.revokeActiveByUser(client, user.id);
    await persistRefreshToken(client, user.id, refreshToken);
  });

  return { token, refreshToken, user: toUserResponse(user) };
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
    // Accounts awaiting review can authenticate only to see their verification status.
    await client.query(
      `UPDATE users
       SET last_login = NOW(),
           last_seen_at = NOW(),
           is_active = CASE WHEN verification_status = 'approved' THEN TRUE ELSE FALSE END
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

async function resubmitVerification(userId, payload) {
  if (!userId) throw httpError(401, 'Invalid token payload.');
  const validIdImage = normalizeValidIdImage(payload?.validIdImage);
  const currentUser = await userModel.findPublicUserById(userId);
  if (!currentUser || currentUser.role !== 'user') throw httpError(404, 'User account not found.');
  if (String(currentUser.verification_status || 'approved').toLowerCase() === 'approved') {
    throw httpError(400, 'This account is already approved.');
  }
  const user = await userModel.resubmitUserVerification(userId, validIdImage);
  if (!user) throw httpError(404, 'User account not found.');
  return { message: 'Your valid ID was resubmitted for review.', user: toUserResponse(user) };
}

async function updateMe(userId, payload) {
  if (!userId) {
    throw httpError(401, 'Invalid token payload.');
  }

  const { firstName, lastName, email, address, contactNumber } = payload || {};
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
  if (currentUser.role === 'user' && String(currentUser.verification_status || 'approved').toLowerCase() !== 'approved') {
    throw httpError(403, 'This account is not approved for access.', 'ACCOUNT_NOT_APPROVED');
  }
  const user = await userModel.updateMyProfile(userId, {
    firstName: String(firstName || '').trim() || null,
    lastName: String(lastName || '').trim() || null,
    email: nextEmail,
    address: String(address || '').trim() || null,
    contactNumber: String(contactNumber || '').trim() || null,
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
  if (currentUser.role !== 'user' || String(currentUser.verification_status || 'approved').toLowerCase() !== 'approved') {
    throw httpError(403, 'This account is not approved for access.', 'ACCOUNT_NOT_APPROVED');
  }

  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw httpError(400, 'A valid current location is required.');
  }

  const nearest = resolveNearbyBarangayAtLocation(
    latitude,
    longitude,
    RESIDENT_BARANGAYS,
    Number.POSITIVE_INFINITY,
  );
  const barangayName = RESIDENT_BARANGAYS.find(
    (name) => name.toLowerCase() === String(nearest?.name || '').toLowerCase(),
  );
  if (!barangayName) {
    throw httpError(400, 'Unable to determine the nearest supported barangay.');
  }

  const user = await userModel.assignResidentBarangayFromLocation(
    userId,
    barangayName,
    latitude,
    longitude,
  );
  if (!user) {
    throw httpError(404, 'Resident account not found.');
  }

  return { user: toUserResponse(user), barangayName };
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  assignBarangayFromLocation,
  resubmitVerification,
};
