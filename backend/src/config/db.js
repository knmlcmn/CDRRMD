const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function sslConfig() {
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
  return undefined;
}

const ssl = sslConfig();
const pool = new Pool({
  ...(connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }),
  ...(ssl === undefined ? {} : { ssl }),
  // A small per-instance pool prevents autoscaled serverless instances from
  // exhausting the hosted database connection limit.
  max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 1 : 5)),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

module.exports = pool;
