const nodemailer = require('nodemailer');

const { hasEmailDeliveryConfig, isPlaceholder } = require('../config/runtimeConfig');
const { httpError } = require('../utils/httpError');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const smtpUrl = String(process.env.SMTP_URL || '').trim();
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const rawPass = String(process.env.SMTP_PASS || '').trim();
  const pass = host === 'smtp.gmail.com' ? rawPass.replace(/\s/g, '') : rawPass;
  if (!hasEmailDeliveryConfig()) {
    throw httpError(
      503,
      'Email verification is temporarily unavailable. Please contact CDRRMD support.',
    );
  }

  transporter = smtpUrl
    ? nodemailer.createTransport(smtpUrl)
    : nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
  return transporter;
}

function fromAddress() {
  const configuredFrom = String(process.env.SMTP_FROM || '').trim();
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const from = configuredFrom && !isPlaceholder(configuredFrom)
    ? configuredFrom
    : smtpUser && !isPlaceholder(smtpUser)
      ? `CDRRMD <${smtpUser}>`
      : '';
  if (!from) {
    throw httpError(503, 'Email delivery is not configured. Please contact CDRRMD support.');
  }
  return from;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendOtpEmail({ email, code, purpose, expiresInMinutes }) {
  const isRegistration = purpose === 'registration';
  const action = isRegistration ? 'complete your CDRRMD account registration' : 'reset your CDRRMD account password';
  const subject = isRegistration ? 'CDRRMD registration verification code' : 'CDRRMD password reset code';
  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject,
    text: `Your CDRRMD verification code is ${code}. It expires in ${expiresInMinutes} minutes. Use it to ${action}. If you did not request this code, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#173750"><h2 style="margin-bottom:8px">CDRRMD verification code</h2><p>Use this code to ${action}:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:24px 0">${code}</p><p>This code expires in ${expiresInMinutes} minutes.</p><p style="color:#64748b;font-size:13px">If you did not request this code, you can safely ignore this email.</p></div>`,
  });
}

async function sendAccountCredentialsEmail({ email, accountId, password, firstName }) {
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: 'Your CDRRMD account ID',
    text: `${greeting}\n\nYour CDRRMD account was created successfully.\n\nLogin email: ${email}\nAccount ID: ${accountId}\nPassword: ${password}\n\nResidents sign in with their email address and password. Keep this email private.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#173750"><h2 style="margin-bottom:8px">Your CDRRMD account</h2><p>${escapeHtml(greeting)}</p><p>Your account was created successfully. Residents sign in to the CDRRMD app or web platform with their email address and password:</p><div style="padding:16px;border-radius:8px;background:#f1f5f9"><p><strong>Login email:</strong> ${escapeHtml(email)}</p><p><strong>Account ID:</strong> ${escapeHtml(accountId)}</p><p><strong>Password:</strong> ${escapeHtml(password)}</p></div><p style="color:#64748b;font-size:13px">Keep this email private and do not share your password.</p></div>`,
  });
}

module.exports = { sendAccountCredentialsEmail, sendOtpEmail };
