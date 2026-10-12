
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

function sslConfig() {
  // Allow SSL to be explicitly disabled for local development.
  if (process.env.DB_SSL === 'false') return false;

  // Enable SSL when connecting to a hosted PostgreSQL database.
  if (process.env.DB_SSL === 'true' || connectionString) {
    return {
      rejectUnauthorized: false,
    };
  }

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

  // Limit connections for serverless environments.
  max: Number(
    process.env.DB_POOL_MAX || (process.env.VERCEL ? 1 : 5)
  ),

  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

module.exports = pool;
