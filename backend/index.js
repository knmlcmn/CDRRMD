const app = require('./src/app');

module.exports = function handler(req, res) {
  // Database changes require an explicit `npm run migrate`; routine builds and
  // request cold starts only load and invoke the Express app.
  return app(req, res);
};
