const { Client } = require('pg');

/**
 * Connects to Postgres using the credentials in .env and makes sure the
 * target database (DB_NAME) actually exists before the app tries to use it.
 *
 * Why this exists: Postgres does NOT auto-create a database just because a
 * pool is pointed at it. If DB_NAME in backend/.env doesn't match an
 * existing database, every query fails, initDb() throws, and server.js
 * calls process.exit(1) *before* app.listen() ever runs — so the backend
 * process ends immediately without ever serving http://localhost:4000.
 * From the frontend this looks like a plain network error ("Failed to
 * load dashboard data.") because there's nothing listening on the port at
 * all, not even a 500 response.
 */
async function ensureDatabaseExists() {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const targetDb = process.env.DB_NAME;

  if (!host || !user || !targetDb) {
    throw new Error(
      'DB_HOST, DB_USER, and DB_NAME must be set in backend/.env.',
    );
  }

  // Connect to the always-present "postgres" maintenance database so we can
  // check for / create the real target database.
  const maintenanceClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });

  try {
    await maintenanceClient.connect();
  } catch (error) {
    const hint =
      error.code === '28P01'
        ? 'Wrong DB_USER / DB_PASSWORD in backend/.env.'
        : error.code === 'ECONNREFUSED'
          ? `No Postgres server is listening on ${host}:${port}. Is PostgreSQL installed and running?`
          : error.code === '3D000'
            ? 'The maintenance database "postgres" is missing — check your Postgres install.'
            : error.message;

    throw new Error(`Could not connect to Postgres (${host}:${port}). ${hint}`);
  }

  try {
    const existing = await maintenanceClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb],
    );

    if (existing.rowCount === 0) {
      console.log(`Database "${targetDb}" does not exist yet — creating it.`);
      // Identifiers can't be parameterized; targetDb comes from our own .env, not user input.
      await maintenanceClient.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`Database "${targetDb}" created.`);
    }
  } finally {
    await maintenanceClient.end();
  }
}

module.exports = ensureDatabaseExists;
