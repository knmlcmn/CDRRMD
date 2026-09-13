const initDb = require('./initDb');

let initializationPromise;

/**
 * Run idempotent schema setup once per Node process. This works for both the
 * local server and Vercel cold starts, where app.listen() is not responsible
 * for application startup.
 */
function initializeDatabase() {
  if (!initializationPromise) {
    initializationPromise = initDb().catch((error) => {
      // Permit a later request to retry after a temporary database outage.
      initializationPromise = undefined;
      throw error;
    });
  }

  return initializationPromise;
}

module.exports = initializeDatabase;
