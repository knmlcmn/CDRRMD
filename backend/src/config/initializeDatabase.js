const initDb = require('./initDb');

let initializationPromise;

/**
 * Run schema setup once per Node process when explicitly requested by the
 * local server or migration command. The Vercel request entrypoint does not
 * call this function.
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
