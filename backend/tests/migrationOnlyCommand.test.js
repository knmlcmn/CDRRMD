const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const commandPath = path.join(backendRoot, 'scripts/migrateSchemaOnly.js');
const commandSource = fs.readFileSync(commandPath, 'utf8');
const initDbSource = fs.readFileSync(path.join(backendRoot, 'src/config/initDb.js'), 'utf8');
const runSchemaMigrations = require('../src/config/schemaMigrations');
const {
  EXECUTION_TIMEOUT_EXIT_CODE,
  createExecutionDeadline,
  runMigrationOnly,
} = require('../scripts/migrateSchemaOnly');

test('schema-only command imports the numbered runner and cannot invoke initialization repairs', () => {
  assert.match(commandSource, /require\('\.\.\/src\/config\/schemaMigrations'\)/);
  assert.doesNotMatch(commandSource, /initDb|initializeDatabase|maintainDatabase/);

  for (const destructiveOperation of [
    'verifiedAreaRepairs',
    'DELETE FROM evacuation_areas',
    'DELETE FROM barangay_boundaries',
    "DELETE FROM users\\s+WHERE role = 'barangay'",
    'SEED_DEFAULT_ACCOUNTS',
  ]) {
    assert.match(initDbSource, new RegExp(destructiveOperation));
    assert.doesNotMatch(commandSource, new RegExp(destructiveOperation));
  }
});

test('schema-only command delegates only to the numbered migration runner', async () => {
  const calls = [];
  const fakePool = { marker: 'pool' };
  await runMigrationOnly({
    databasePool: fakePool,
    migrationRunner: async (receivedPool, options) => calls.push({ receivedPool, options }),
    logger: { log() {}, error() {} },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receivedPool, fakePool);
  assert.equal(calls[0].options.advisoryLockTimeoutMs, 5_000);
  assert.equal(calls[0].options.migrationStatementTimeoutMs, 30_000);
});

test('migration 10 is transactional and advisory-lock acquisition is bounded first', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes('SELECT 1 FROM schema_migrations')) {
        return { rowCount: params[0] === 10 ? 0 : 1 };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const fakePool = {
    async query(sql) { queries.push({ sql: String(sql), params: [] }); return { rowCount: 0 }; },
    async connect() { return client; },
  };

  await runSchemaMigrations(fakePool, {
    advisoryLockTimeoutMs: 1_234,
    migrationStatementTimeoutMs: 9_876,
  });

  const migrationTenCheck = queries.findIndex((entry) => entry.sql.includes('SELECT 1 FROM schema_migrations') && entry.params[0] === 10);
  const transactionStart = queries.map((entry) => entry.sql).lastIndexOf('BEGIN', migrationTenCheck);
  const lockTimeout = queries.findIndex((entry, index) => index > transactionStart
    && entry.sql.includes("set_config('statement_timeout'") && entry.params[0] === '1234ms');
  const advisoryLock = queries.findIndex((entry, index) => index > transactionStart
    && entry.sql.includes('pg_advisory_xact_lock'));
  const statementTimeout = queries.findIndex((entry, index) => index > advisoryLock
    && entry.sql.includes("set_config('statement_timeout'") && entry.params[0] === '9876ms');
  const migrationTenDdl = queries.findIndex((entry, index) => index > migrationTenCheck
    && entry.sql.includes('outside_normal_service_area'));
  const commit = queries.findIndex((entry, index) => index > migrationTenDdl && entry.sql === 'COMMIT');

  assert.ok(transactionStart >= 0);
  assert.ok(lockTimeout > transactionStart);
  assert.ok(advisoryLock > lockTimeout);
  assert.ok(statementTimeout > advisoryLock);
  assert.ok(migrationTenDdl > migrationTenCheck);
  assert.ok(commit > migrationTenDdl);
});

test('advisory-lock timeout rolls back and releases the migration client', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(String(sql));
      if (String(sql).includes('pg_advisory_xact_lock')) {
        const error = new Error('canceling statement due to statement timeout');
        error.code = '57014';
        throw error;
      }
      return { rowCount: 0, rows: [] };
    },
    release() { released = true; },
  };
  const fakePool = {
    async query() { return { rowCount: 0 }; },
    async connect() { return client; },
  };

  await assert.rejects(
    runSchemaMigrations(fakePool, { advisoryLockTimeoutMs: 25 }),
    /Schema migration 1 .*statement timeout/,
  );
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});

test('external execution deadline is bounded and exits with the timeout code', () => {
  let callback;
  let delay;
  let exitCode;
  let cleared = false;
  const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
  const cancel = createExecutionDeadline({
    timeoutMs: 42_000,
    logger: { error() {} },
    onTimeout: () => { exitCode = EXECUTION_TIMEOUT_EXIT_CODE; },
    setTimer: (receivedCallback, receivedDelay) => {
      callback = receivedCallback;
      delay = receivedDelay;
      return timer;
    },
    clearTimer: (receivedTimer) => { cleared = receivedTimer === timer; },
  });
  assert.equal(delay, 42_000);
  assert.equal(timer.unrefCalled, true);
  callback();
  assert.equal(exitCode, 124);
  cancel();
  assert.equal(cleared, true);
});
