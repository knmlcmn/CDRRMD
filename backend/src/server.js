require('dotenv').config();

const pool = require('./config/db');
const ensureDatabaseExists = require('./config/ensureDatabase');
const initializeDatabase = require('./config/initializeDatabase');
const app = require('./app');

// Render automatically provides PORT.
// Locally, the backend will use port 4000.
const PORT = Number(process.env.PORT || 4000);
const HOST = '0.0.0.0';

// If DATABASE_URL or POSTGRES_URL exists, we assume the
// PostgreSQL database already exists.
// Otherwise, use the existing local database preparation logic.
const prepareDatabase =
  process.env.DATABASE_URL || process.env.POSTGRES_URL
    ? Promise.resolve()
    : ensureDatabaseExists();

prepareDatabase
  .then(() => initializeDatabase())
  .then(() =>
    pool.query(`
      SELECT CONCAT(
        'ADM-',
        EXTRACT(YEAR FROM created_at)::text,
        '-',
        LPAD(id::text, 5, '0')
      ) AS account_id
      FROM users
      WHERE username = 'admin'
        AND role = 'admin'
      LIMIT 1
    `)
  )
  .then((adminResult) => {
    app.listen(PORT, HOST, () => {
      console.log(`Backend running on port ${PORT}`);
      console.log(
        `Admin account ID: ${
          adminResult.rows[0]?.account_id || 'see Admin Accounts'
        }`
      );
    });
  })
  .catch((error) => {
    console.error('');
    console.error('=================================================');
    console.error(' Backend failed to start — see the reason below.');
    console.error('=================================================');
    console.error(error.message);
    console.error('');
    console.error('Database configuration:');
    console.error(` DB_HOST: ${process.env.DB_HOST || 'not set'}`);
    console.error(` DB_PORT: ${process.env.DB_PORT || 'not set'}`);
    console.error(` DB_NAME: ${process.env.DB_NAME || 'not set'}`);
    console.error(` DB_USER: ${process.env.DB_USER || 'not set'}`);
    console.error(' DB_PASSWORD: [hidden]');
    console.error('=================================================');
    console.error('');

    process.exit(1);
  });