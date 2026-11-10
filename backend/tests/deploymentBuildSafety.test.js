const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

test('routine Vercel builds validate configuration without invoking database work', () => {
  const packageJson = JSON.parse(read('package.json'));
  const vercelConfig = JSON.parse(read('vercel.json'));
  const buildCommand = packageJson.scripts?.['vercel-build'];

  assert.equal(vercelConfig.buildCommand, 'npm run vercel-build');
  assert.equal(buildCommand, 'npm run verify:deployment');
  assert.doesNotMatch(buildCommand, /migrat|init(?:ialize)?(?:-?db)?|seed|database|\bdb\b/i);

  const verificationChain = [
    read('scripts/verifyDeploymentConfig.js'),
    read('src/config/loadEnv.js'),
    read('src/config/runtimeConfig.js'),
  ].join('\n');
  assert.doesNotMatch(
    verificationChain,
    /config\/db|initializeDatabase|initDb|schemaMigrations|scripts\/migrate/,
  );
});

test('database migration remains explicit and outside the serverless request path', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts?.migrate, 'node scripts/migrate.js');

  const migrationRunner = read('scripts/migrate.js');
  assert.match(migrationRunner, /initializeDatabase/);

  const serverlessEntry = read('index.js');
  assert.match(serverlessEntry, /require\('\.\/src\/app'\)/);
  assert.doesNotMatch(serverlessEntry, /initializeDatabase|initDb|schemaMigrations|scripts\/migrate/);

  // Standalone/local startup intentionally retains its existing initialization
  // behavior. Production must continue to use the serverless index.js entrypoint.
  const standaloneEntry = read('src/server.js');
  assert.match(standaloneEntry, /initializeDatabase/);
});
