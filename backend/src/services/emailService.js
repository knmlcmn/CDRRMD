const nodemailer = require('nodemailer');

const { httpError } = require('../utils/httpError');

let transporter;

function isPlaceholder(value) {
  const normalized = String(value || '').trim();
  return /your-sender|your-16-character|replace-with|paste-|app-password|generated-by-google|example\.com/i.test(normalized);
}

function getTransporter() {
  if (transporter) return transporter;

  const smtpUrl = String(process.env.SMTP_URL || '').trim();
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const rawPass = String(process.env.SMTP_PASS || '').trim();
  const pass = host === 'smtp.gmail.com' ? rawPass.replace(/\s/g, '') : rawPass;
  if (!smtpUrl && (!host || !user || !pass || isPlaceholder(user) || isPlaceholder(pass))) {
    throw httpError(
      503,
      'Email delivery is not configured. Set a real SMTP_USER and Google App Password in backend/.env, then restart the backend.',
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

async function sendOtpEmail({ email, code, purpose, expiresInMinutes }) {
  const isRegistration = purpose === 'registration';
  const action = isRegistration ? 'complete your CDRRMD account registration' : 'reset your CDRRMD account password';
  const subject = isRegistration ? 'CDRRMD registration verification code' : 'CDRRMD password reset code';
  const configuredFrom = String(process.env.SMTP_FROM || '').trim();
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const from = !configuredFrom || isPlaceholder(configuredFrom)
    ? `CDRRMD <${smtpUser}>`
    : configuredFrom;
  if (!from) {
    throw httpError(503, 'Email delivery is not configured. Please contact CDRRMD support.');
  }

  await getTransporter().sendMail({
    from,
    to: email,
    subject,
    text: `Your CDRRMD verification code is ${code}. It expires in ${expiresInMinutes} minutes. Use it to ${action}. If you did not request this code, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#173750"><h2 style="margin-bottom:8px">CDRRMD verification code</h2><p>Use this code to ${action}:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:24px 0">${code}</p><p>This code expires in ${expiresInMinutes} minutes.</p><p style="color:#64748b;font-size:13px">If you did not request this code, you can safely ignore this email.</p></div>`,
  });
}

module.exports = { sendOtpEmail };
