const pool = require('../config/db');

async function withTransaction(work) {
  // Shared transaction wrapper so service flows stay concise and consistent.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function revokeActiveByUser(client, userId) {
  await client.query(
    'UPDATE user_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}

async function insertRefreshToken(client, userId, tokenHash, expiresAt) {
  await client.query(
    `INSERT INTO user_refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

async function findValidToken(client, userId, tokenHash) {
  const result = await client.query(
    `SELECT id
     FROM user_refresh_tokens
     WHERE user_id = $1
       AND token_hash = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [userId, tokenHash],
  );
  return result.rows[0] || null;
}

async function revokeById(client, id) {
  await client.query('UPDATE user_refresh_tokens SET revoked_at = NOW() WHERE id = $1', [id]);
}

module.exports = {
  withTransaction,
  revokeActiveByUser,
  insertRefreshToken,
  findValidToken,
  revokeById,
};
