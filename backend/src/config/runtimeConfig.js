function isPlaceholder(value) {
  const normalized = String(value || '').trim();
  return !normalized || /your-sender|your-16-character|replace-with|paste-|app-password|generated-by-google|example\.com/i.test(normalized);
}

function hasRealValue(name) {
  return !isPlaceholder(process.env[name]);
}

function hasDatabaseConfig() {
  return hasRealValue('DATABASE_URL') ||
    hasRealValue('POSTGRES_URL') ||
    ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].every(hasRealValue);
}

function hasEmailDeliveryConfig() {
  return hasRealValue('SMTP_URL') ||
    ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every(hasRealValue);
}

function getRuntimeConfigStatus() {
  return {
    database: hasDatabaseConfig(),
    accessTokenSigning: hasRealValue('JWT_SECRET'),
    refreshTokenSigning: hasRealValue('JWT_REFRESH_SECRET'),
    otpSigning: hasRealValue('OTP_SECRET') || hasRealValue('JWT_SECRET'),
    emailDelivery: hasEmailDeliveryConfig(),
    cors: hasRealValue('CORS_ORIGINS'),
  };
}

function assertDeploymentConfig() {
  const status = getRuntimeConfigStatus();
  const settingNames = {
    database: 'DATABASE_URL',
    accessTokenSigning: 'JWT_SECRET',
    refreshTokenSigning: 'JWT_REFRESH_SECRET',
    otpSigning: 'OTP_SECRET or JWT_SECRET',
    emailDelivery: 'SMTP_URL or SMTP_HOST/SMTP_USER/SMTP_PASS',
    cors: 'CORS_ORIGINS',
  };
  const missing = Object.entries(status)
    .filter(([, configured]) => !configured)
    .map(([name]) => settingNames[name]);

  if (missing.length) {
    throw new Error(
      `Production configuration is incomplete: ${missing.join(', ')}. ` +
      'Set the required values in the backend Vercel project for the target environment and redeploy.',
    );
  }

  return status;
}

module.exports = {
  assertDeploymentConfig,
  getRuntimeConfigStatus,
  hasEmailDeliveryConfig,
  isPlaceholder,
};
