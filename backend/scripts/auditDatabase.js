require('../src/config/loadEnv');

const pool = require('../src/config/db');

const EXPECTED_TABLES = [
  'alerts',
  'announcements',
  'backup_requests',
  'barangays',
  'barangay_boundaries',
  'email_otp_codes',
  'evacuation_areas',
  'family_invitations',
  'flood_sensor_alert_events',
  'incident_reports',
  'report_status_logs',
  'schema_migrations',
  'system_settings',
  'user_notifications',
  'user_refresh_tokens',
  'users',
];

async function queryRows(client, text, params = []) {
  try {
    const result = await client.query(text, params);
    return result.rows;
  } catch (error) {
    error.message = `${error.message} (query: ${text.replace(/\s+/g, ' ').trim().slice(0, 160)})`;
    throw error;
  }
}

async function auditDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN READ ONLY');

    const tables = await queryRows(client, `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tableNames = tables.map(({ table_name: name }) => name);

    const columns = await queryRows(client, `
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const constraints = await queryRows(client, `
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
    `);

    const indexes = await queryRows(client, `
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    const rowCounts = {};
    for (const tableName of tableNames) {
      // Table names originate from PostgreSQL's catalog, not user input.
      const [{ count }] = await queryRows(
        client,
        `SELECT COUNT(*)::integer AS count FROM "${tableName.replaceAll('"', '""')}"`
      );
      rowCounts[tableName] = count;
    }

    const dataChecks = {};
    if (tableNames.includes('users')) {
      dataChecks.users = (await queryRows(client, `
        SELECT
          (SELECT COUNT(*)::integer FROM users WHERE username IS NOT NULL AND btrim(username) = '') AS blank_usernames,
          (SELECT COUNT(*)::integer FROM users WHERE email IS NOT NULL AND btrim(email) = '') AS blank_emails,
          (SELECT COUNT(*)::integer FROM (
            SELECT lower(btrim(username)) AS normalized_value
            FROM users
            WHERE username IS NOT NULL AND btrim(username) <> ''
            GROUP BY lower(btrim(username))
            HAVING COUNT(*) > 1
          ) AS duplicate_usernames) AS duplicate_usernames_case_insensitive,
          (SELECT COUNT(*)::integer FROM (
            SELECT lower(btrim(email)) AS normalized_value
            FROM users
            WHERE email IS NOT NULL AND btrim(email) <> ''
            GROUP BY lower(btrim(email))
            HAVING COUNT(*) > 1
          ) AS duplicate_emails) AS duplicate_emails_case_insensitive
      `))[0];

      dataChecks.userRoles = await queryRows(client, `
        SELECT COALESCE(role, '<null>') AS value, COUNT(*)::integer AS count
        FROM users
        GROUP BY role
        ORDER BY role NULLS FIRST
      `);
    }

    if (tableNames.includes('incident_reports')) {
      dataChecks.incidentStatuses = await queryRows(client, `
        SELECT COALESCE(status, '<null>') AS value, COUNT(*)::integer AS count
        FROM incident_reports
        GROUP BY status
        ORDER BY status NULLS FIRST
      `);
      dataChecks.incidentTypes = await queryRows(client, `
        SELECT COALESCE(report_type, '<null>') AS value, COUNT(*)::integer AS count
        FROM incident_reports
        GROUP BY report_type
        ORDER BY report_type NULLS FIRST
      `);
    }

    if (tableNames.includes('backup_requests')) {
      dataChecks.backupDispatchTypes = await queryRows(client, `
        SELECT COALESCE(dispatch_type, '<null>') AS value, COUNT(*)::integer AS count
        FROM backup_requests
        GROUP BY dispatch_type
        ORDER BY dispatch_type NULLS FIRST
      `);
    }

    if (tableNames.includes('barangays')) {
      dataChecks.barangayReferenceCoverage = await queryRows(client, `
        SELECT 'users.barangay_id' AS reference,
               (COUNT(*) FILTER (WHERE barangay_name IS NOT NULL AND BTRIM(barangay_name) <> ''))::integer AS expected,
               (COUNT(*) FILTER (WHERE barangay_id IS NOT NULL))::integer AS populated
        FROM users
        UNION ALL
        SELECT 'backup_requests.barangay_id', COUNT(*)::integer,
               (COUNT(*) FILTER (WHERE barangay_id IS NOT NULL))::integer
        FROM backup_requests
        UNION ALL
        SELECT 'barangay_boundaries.barangay_id', COUNT(*)::integer,
               (COUNT(*) FILTER (WHERE barangay_id IS NOT NULL))::integer
        FROM barangay_boundaries
        UNION ALL
        SELECT 'evacuation_areas.barangay_id', COUNT(*)::integer,
               (COUNT(*) FILTER (WHERE barangay_id IS NOT NULL))::integer
        FROM evacuation_areas
        UNION ALL
        SELECT 'incident_reports.assigned_barangay_id',
               (COUNT(*) FILTER (WHERE assigned_barangay IS NOT NULL AND BTRIM(assigned_barangay) <> ''))::integer,
               (COUNT(*) FILTER (WHERE assigned_barangay_id IS NOT NULL))::integer
        FROM incident_reports
        UNION ALL
        SELECT 'user_notifications.barangay_id',
               (COUNT(*) FILTER (WHERE barangay_name IS NOT NULL AND BTRIM(barangay_name) <> ''))::integer,
               (COUNT(*) FILTER (WHERE barangay_id IS NOT NULL))::integer
        FROM user_notifications
        UNION ALL
        SELECT 'flood_sensor_alert_events.barangay_id', COUNT(*)::integer,
               (COUNT(*) FILTER (WHERE barangay_id IS NOT NULL))::integer
        FROM flood_sensor_alert_events
        ORDER BY reference
      `);

      dataChecks.schemaMigrations = await queryRows(client, `
        SELECT version, name, applied_at
        FROM schema_migrations
        ORDER BY version
      `);

      dataChecks.normalizationObjects = (await queryRows(client, `
        SELECT
          (SELECT COUNT(*)::integer
           FROM pg_constraint
           WHERE conname IN (
             'users_barangay_id_fkey',
             'backup_requests_barangay_id_fkey',
             'barangay_boundaries_barangay_id_fkey',
             'evacuation_areas_barangay_id_fkey',
             'incident_reports_assigned_barangay_id_fkey',
             'user_notifications_barangay_id_fkey',
             'flood_sensor_alert_events_barangay_id_fkey'
           ) AND convalidated = TRUE) AS validated_barangay_foreign_keys,
          (SELECT COUNT(*)::integer
           FROM pg_trigger
           WHERE NOT tgisinternal AND tgname LIKE '%sync_barangay_reference') AS barangay_sync_triggers,
          (SELECT COUNT(*)::integer
           FROM pg_constraint
           WHERE conname IN (
             'users_role_valid',
             'incident_reports_type_valid',
             'incident_reports_status_valid',
             'backup_requests_dispatch_type_valid'
           ) AND convalidated = TRUE) AS validated_workflow_constraints
      `))[0];
    }

    const report = {
      generatedAt: new Date().toISOString(),
      database: process.env.DB_NAME || 'connection-url database',
      summary: {
        tableCount: tableNames.length,
        columnCount: columns.length,
        constraintCount: constraints.length,
        indexCount: indexes.length,
        missingExpectedTables: EXPECTED_TABLES.filter((name) => !tableNames.includes(name)),
        unexpectedTables: tableNames.filter((name) => !EXPECTED_TABLES.includes(name)),
      },
      rowCounts,
      columns,
      constraints,
      indexes,
      dataChecks,
    };

    await client.query('ROLLBACK');
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

auditDatabase()
  .then((report) => {
    const output = process.argv.includes('--summary')
      ? {
          generatedAt: report.generatedAt,
          database: report.database,
          summary: report.summary,
          rowCounts: report.rowCounts,
          dataChecks: report.dataChecks,
        }
      : report;
    console.log(JSON.stringify(output, null, 2));
  })
  .catch((error) => {
    console.error('Database audit failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

