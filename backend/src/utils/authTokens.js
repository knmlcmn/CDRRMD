const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_SECRET || 'cddrmd-dev-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'cddrmd-dev-refresh-secret';
const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function parseExpiresInToDate(expiresIn) {
  // Accepts compact units like 30d, 12h, 15m, 20s.
  const value = String(expiresIn || '').trim();
  const match = value.match(/^(\d+)([smhd])$/i);

  if (!match) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + amount * multipliers[unit]);
}

function hashRefreshToken(token) {
  // Store/compare refresh tokens by hash rather than raw value.
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function issueTokens(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    barangayName: user.barangay_name || null,
  };

  const token = jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

  return { token, refreshToken };
}

function verifyRefreshToken(refreshToken) {
  return jwt.verify(refreshToken, REFRESH_SECRET);
}

module.exports = {
  ACCESS_EXPIRES_IN,
  REFRESH_EXPIRES_IN,
  parseExpiresInToDate,
  hashRefreshToken,
  issueTokens,
  verifyRefreshToken,
};
