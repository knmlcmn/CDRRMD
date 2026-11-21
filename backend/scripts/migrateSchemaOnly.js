require('../src/config/loadEnv');

const pool = require('../src/config/db');
const runSchemaMigrations = require('../src/config/schemaMigrations');

const DEFAULT_EXECUTION_TIMEOUT_MS = 120_000;
const EXECUTION_TIMEOUT_EXIT_CODE = 124;

function positiveTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createExecutionDeadline({
  timeoutMs,
  logger = console,
  onTimeout = () => process.exit(EXECUTION_TIMEOUT_EXIT_CODE),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const timer = setTimer(() => {
    logger.error(`Schema migration exceeded the ${timeoutMs}ms external execution timeout.`);
    onTimeout();
  }, timeoutMs);
  timer.unref?.();
  return () => clearTimer(timer);
}

async function runMigrationOnly({
  databasePool = pool,
  migrationRunner = runSchemaMigrations,
  logger = console,
} = {}) {
  logger.log('Applying pending numbered schema migrations only...');
  await migrationRunner(databasePool, {
    advisoryLockTimeoutMs: positiveTimeout(process.env.SCHEMA_MIGRATION_LOCK_TIMEOUT_MS, 5_000),
    migrationStatementTimeoutMs: positiveTimeout(process.env.SCHEMA_MIGRATION_STATEMENT_TIMEOUT_MS, 30_000),
  });
  logger.log('Numbered schema migrations are up to date.');
}

async function main() {
  const executionTimeoutMs = positiveTimeout(
    process.env.SCHEMA_MIGRATION_EXECUTION_TIMEOUT_MS,
    DEFAULT_EXECUTION_TIMEOUT_MS,
  );
  const cancelDeadline = createExecutionDeadline({ timeoutMs: executionTimeoutMs });
  try {
    await runMigrationOnly();
  } catch (error) {
    console.error('Schema-only migration failed:', error);
    process.exitCode = 1;
  } finally {
    cancelDeadline();
    await pool.end();
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  DEFAULT_EXECUTION_TIMEOUT_MS,
  EXECUTION_TIMEOUT_EXIT_CODE,
  createExecutionDeadline,
  runMigrationOnly,
};
