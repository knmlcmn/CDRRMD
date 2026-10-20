require('../src/config/loadEnv');

const { assertDeploymentConfig } = require('../src/config/runtimeConfig');

try {
  assertDeploymentConfig();
  console.log('Production authentication, email, database, and CORS configuration is complete.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
