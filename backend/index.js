const app = require('./src/app');

module.exports = function handler(req, res) {
  // Vercel applies schema updates through the deployment-time build command.
  // Keep request cold starts limited to loading and invoking the Express app.
  return app(req, res);
};
