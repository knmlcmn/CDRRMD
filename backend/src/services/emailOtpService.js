const crypto = require('crypto');

const emailOtpModel = require('../models/emailOtpModel');
const { sendOtpEmail } = require('./emailService');
const { httpError } = require('../utils/httpError');

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const ALLOWED_PURPOSES = new Set(['registration', 'password_reset']);

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw httpError(400, 'Please provide a valid email address.');
  }
  return email;
}

function hashCode(email, purpose, code) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw httpError(503, 'OTP verification is not configured.');
  return crypto.createHmac('sha256', secret).update(`${email}:${purpose}:${code}`).digest('hex');
}

function validatePurpose(purpose) {
  if (!ALLOWED_PURPOSES.has(purpose)) throw httpError(400, 'Invalid OTP purpose.');
}

async function sendCode(emailValue, purpose) {
  validatePurpose(purpose);
  const email = normalizeEmail(emailValue);
  const latest = await emailOtpModel.findLatest(email, purpose);
  if (latest) {
    const elapsedSeconds = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
    if (elapsedSeconds < OTP_RESEND_SECONDS) {
      throw httpError(429, `Please wait ${Math.ceil(OTP_RESEND_SECONDS - elapsedSeconds)} seconds before requesting another code.`);
    }
  }

  const code = String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
  const codeHash = hashCode(email, purpose, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const record = await emailOtpModel.replaceActive(email, purpose, codeHash, expiresAt);
  try {
    await sendOtpEmail({ email, code, purpose, expiresInMinutes: OTP_TTL_MINUTES });
  } catch (error) {
    await emailOtpModel.remove(record.id).catch(() => {});
    if (error?.status) throw error;
    throw httpError(503, 'The verification email could not be sent. Please try again later.');
  }
  return { email, expiresInSeconds: OTP_TTL_MINUTES * 60, resendAfterSeconds: OTP_RESEND_SECONDS };
}

async function verifyCode(emailValue, purpose, codeValue) {
  validatePurpose(purpose);
  const email = normalizeEmail(emailValue);
  const code = String(codeValue || '').trim();
  if (!/^\d{6}$/.test(code)) throw httpError(400, 'Enter the 6-digit verification code.', 'INVALID_OTP');

  const result = await emailOtpModel.verifyAndConsume(
    email,
    purpose,
    hashCode(email, purpose, code),
    OTP_MAX_ATTEMPTS,
  );
  if (!result.ok) {
    const message = result.reason === 'attempts'
      ? 'Too many incorrect attempts. Request a new verification code.'
      : result.reason === 'expired'
        ? 'The verification code is missing or expired. Request a new code.'
        : 'The verification code is incorrect.';
    throw httpError(400, message, 'INVALID_OTP');
  }
  return email;
}

module.exports = {
  normalizeEmail,
  sendCode,
  verifyCode,
};
