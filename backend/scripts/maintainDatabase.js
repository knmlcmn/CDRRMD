require('../src/config/loadEnv');

const pool = require('../src/config/db');

const shouldApply = process.argv.includes('--apply');

async function getMaintenanceCounts(client) {
  const refreshTokens = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE revoked_at IS NULL AND expires_at > NOW()
      )::int AS active,
      COUNT(*) FILTER (
        WHERE revoked_at IS NOT NULL OR expires_at <= NOW()
      )::int AS removable
    FROM user_refresh_tokens
  `);
  const otpCodes = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE consumed_at IS NOT NULL OR expires_at <= NOW()
      )::int AS removable
    FROM email_otp_codes
  `);

  return {
    refreshTokens: refreshTokens.rows[0],
    otpCodes: otpCodes.rows[0],
  };
}

async function maintainDatabase() {
  const client = await pool.connect();

  try {
    const before = await getMaintenanceCounts(client);

    if (!shouldApply) {
      console.log(JSON.stringify({ mode: 'dry-run', before }, null, 2));
      console.log('Run `npm run db:maintain -- --apply` to remove only invalid transient records.');
      return;
    }

    await client.query('BEGIN');
    const deletedRefreshTokens = await client.query(`
      DELETE FROM user_refresh_tokens
      WHERE revoked_at IS NOT NULL OR expires_at <= NOW()
    `);
    const deletedOtpCodes = await client.query(`
      DELETE FROM email_otp_codes
      WHERE consumed_at IS NOT NULL OR expires_at <= NOW()
    `);
    await client.query('COMMIT');

    const after = await getMaintenanceCounts(client);
    console.log(JSON.stringify({
      mode: 'applied',
      deleted: {
        refreshTokens: deletedRefreshTokens.rowCount,
        otpCodes: deletedOtpCodes.rowCount,
      },
      before,
      after,
    }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The transaction may not have started in dry-run mode.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

maintainDatabase().catch((error) => {
  console.error('Database maintenance failed:', error.message);
  process.exitCode = 1;
});
