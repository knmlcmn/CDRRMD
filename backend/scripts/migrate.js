require('../src/config/loadEnv');

const initializeDatabase = require('../src/config/initializeDatabase');
const pool = require('../src/config/db');

async function migrate() {
  console.log('Applying database schema updates...');
  await initializeDatabase();
  console.log('Database schema is up to date.');
}

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
