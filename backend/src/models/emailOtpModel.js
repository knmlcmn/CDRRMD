const crypto = require('crypto');

const pool = require('../config/db');

async function findLatest(email, purpose) {
  const result = await pool.query(
    `SELECT id, created_at
     FROM email_otp_codes
     WHERE email = $1 AND purpose = $2
     ORDER BY id DESC
     LIMIT 1`,
    [email, purpose],
  );
  return result.rows[0] || null;
}

async function replaceActive(email, purpose, codeHash, expiresAt) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM email_otp_codes
       WHERE expires_at < NOW() - INTERVAL '1 day'
          OR consumed_at < NOW() - INTERVAL '1 day'`,
    );
    await client.query(
      `UPDATE email_otp_codes
       SET consumed_at = NOW()
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [email, purpose],
    );
    const result = await client.query(
      `INSERT INTO email_otp_codes (email, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, purpose, codeHash, expiresAt],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function remove(id) {
  await pool.query('DELETE FROM email_otp_codes WHERE id = $1', [id]);
}

async function verifyAndConsume(email, purpose, submittedHash, maxAttempts) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, code_hash, expires_at, attempt_count
       FROM email_otp_codes
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [email, purpose],
    );
    const record = result.rows[0];
    if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
      if (record) await client.query('UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1', [record.id]);
      await client.query('COMMIT');
      return { ok: false, reason: 'expired' };
    }

    if (Number(record.attempt_count) >= maxAttempts) {
      await client.query('UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1', [record.id]);
      await client.query('COMMIT');
      return { ok: false, reason: 'attempts' };
    }

    const expected = Buffer.from(record.code_hash, 'hex');
    const submitted = Buffer.from(submittedHash, 'hex');
    const matches = expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);
    if (!matches) {
      const nextAttempts = Number(record.attempt_count) + 1;
      await client.query(
        `UPDATE email_otp_codes
         SET attempt_count = $2,
             consumed_at = CASE WHEN $2 >= $3 THEN NOW() ELSE consumed_at END
         WHERE id = $1`,
        [record.id, nextAttempts, maxAttempts],
      );
      await client.query('COMMIT');
      return { ok: false, reason: nextAttempts >= maxAttempts ? 'attempts' : 'invalid' };
    }

    await client.query('UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1', [record.id]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findLatest,
  replaceActive,
  remove,
  verifyAndConsume,
};
