require('dotenv').config();

const pool = require('./config/db');
const ensureDatabaseExists = require('./config/ensureDatabase');
const initializeDatabase = require('./config/initializeDatabase');
const app = require('./app');

const port = Number(process.env.PORT || 4000);

const prepareLocalDatabase = process.env.DATABASE_URL || process.env.POSTGRES_URL
  ? Promise.resolve()
  : ensureDatabaseExists();

prepareLocalDatabase
  .then(() => initializeDatabase())
  .then(() => pool.query(
    `SELECT CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS account_id
     FROM users WHERE username = 'admin' AND role = 'admin' LIMIT 1`,
  ))
  .then((adminResult) => {
    app.listen(port, () => {
      console.log(`Backend running on http://localhost:${port}`);
      console.log(`Seeded admin account => ID: ${adminResult.rows[0]?.account_id || 'see Admin Accounts'} | password: Admin@123`);
    });
  })
  .catch((error) => {
    // IMPORTANT: if we get here, app.listen() never runs, so nothing is served
    // on this port at all. From the admin-web dashboard this shows up as
    // "Failed to load dashboard data." (a plain network error) rather than
    // an API error message, because there's no server to respond.
    console.error('');
    console.error('=================================================');
    console.error(' Backend failed to start — see the reason below.');
    console.error('=================================================');
    console.error(error.message);
    console.error('');
    console.error('Checklist:');
    console.error('  1. Is PostgreSQL actually installed and running?');
    console.error(`  2. Does backend/.env DB_HOST/DB_PORT (${process.env.DB_HOST}:${process.env.DB_PORT}) match your local Postgres?`);
    console.error(`  3. Do DB_USER/DB_PASSWORD in backend/.env match a real Postgres role?`);
    console.error(`  4. DB_NAME is "${process.env.DB_NAME}" — this script will auto-create it if the server`);
    console.error('     is reachable, but it cannot create the Postgres server itself.');
    console.error('=================================================');
    console.error('');
    process.exit(1);
  });
