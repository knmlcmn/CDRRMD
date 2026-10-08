const app = require('./src/app');
const initializeDatabase = require('./src/config/initializeDatabase');

let initializationPromise;

module.exports = async function handler(req, res) {
  if (!initializationPromise) {
    initializationPromise = initializeDatabase().catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }

  await initializationPromise;
  return app(req, res);
};
