const app = require('./src/app');

module.exports = async function handler(req, res) {
  // Schema migrations belong in deployment/release setup. Opt in only for a
  // brand-new database; loading the large initializer on every serverless cold
  // start adds avoidable latency to every API route.
  if (process.env.INITIALIZE_DATABASE_ON_COLD_START === 'true') {
    const initializeDatabase = require('./src/config/initializeDatabase');
    await initializeDatabase();
  }
  return app(req, res);
};
