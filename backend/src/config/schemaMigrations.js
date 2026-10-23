const MIGRATIONS = [
  {
    version: 1,
    name: 'normalize_barangay_references',
    sql: `
      CREATE TABLE IF NOT EXISTS barangays (
        id SMALLSERIAL PRIMARY KEY,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(120) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS barangays_code_unique_idx
        ON barangays (LOWER(code));
      CREATE UNIQUE INDEX IF NOT EXISTS barangays_name_unique_idx
        ON barangays (LOWER(name));

      INSERT INTO barangays (code, name)
      VALUES
        ('PALINGON', 'Palingon'),
        ('LINGGA', 'Lingga'),
        ('SAMPIRUHAN', 'Sampiruhan'),
        ('LOOC', 'Looc'),
        ('UWISAN', 'Uwisan'),
        ('PARIAN', 'Parian')
      ON CONFLICT DO NOTHING;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS barangay_id SMALLINT;
      ALTER TABLE backup_requests ADD COLUMN IF NOT EXISTS barangay_id SMALLINT;
      ALTER TABLE barangay_boundaries ADD COLUMN IF NOT EXISTS barangay_id SMALLINT;
      ALTER TABLE evacuation_areas ADD COLUMN IF NOT EXISTS barangay_id SMALLINT;
      ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS assigned_barangay_id SMALLINT;
      ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS barangay_id SMALLINT;
      ALTER TABLE flood_sensor_alert_events ADD COLUMN IF NOT EXISTS barangay_id SMALLINT;

      UPDATE users target
      SET barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.barangay_name)) = LOWER(source.name)
        AND target.barangay_id IS DISTINCT FROM source.id;

      UPDATE backup_requests target
      SET barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.barangay_name)) = LOWER(source.name)
        AND target.barangay_id IS DISTINCT FROM source.id;

      UPDATE barangay_boundaries target
      SET barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.barangay_name)) = LOWER(source.name)
        AND target.barangay_id IS DISTINCT FROM source.id;

      UPDATE evacuation_areas target
      SET barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.barangay)) = LOWER(source.name)
        AND target.barangay_id IS DISTINCT FROM source.id;

      UPDATE incident_reports target
      SET assigned_barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.assigned_barangay)) = LOWER(source.name)
        AND target.assigned_barangay_id IS DISTINCT FROM source.id;

      UPDATE user_notifications target
      SET barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.barangay_name)) = LOWER(source.name)
        AND target.barangay_id IS DISTINCT FROM source.id;

      UPDATE flood_sensor_alert_events target
      SET barangay_id = source.id
      FROM barangays source
      WHERE LOWER(BTRIM(target.barangay_name)) = LOWER(source.name)
        AND target.barangay_id IS DISTINCT FROM source.id;

      DO $$
      DECLARE
        item RECORD;
      BEGIN
        FOR item IN
          SELECT * FROM (VALUES
            ('users', 'users_barangay_id_fkey', 'barangay_id'),
            ('backup_requests', 'backup_requests_barangay_id_fkey', 'barangay_id'),
            ('barangay_boundaries', 'barangay_boundaries_barangay_id_fkey', 'barangay_id'),
            ('evacuation_areas', 'evacuation_areas_barangay_id_fkey', 'barangay_id'),
            ('incident_reports', 'incident_reports_assigned_barangay_id_fkey', 'assigned_barangay_id'),
            ('user_notifications', 'user_notifications_barangay_id_fkey', 'barangay_id'),
            ('flood_sensor_alert_events', 'flood_sensor_alert_events_barangay_id_fkey', 'barangay_id')
          ) AS definitions(table_name, constraint_name, column_name)
        LOOP
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = item.constraint_name) THEN
            EXECUTE format(
              'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES barangays(id) ON DELETE RESTRICT NOT VALID',
              item.table_name,
              item.constraint_name,
              item.column_name
            );
          END IF;
          EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', item.table_name, item.constraint_name);
        END LOOP;
      END $$;

      CREATE INDEX IF NOT EXISTS users_barangay_id_idx ON users (barangay_id) WHERE barangay_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS backup_requests_barangay_created_idx ON backup_requests (barangay_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS barangay_boundaries_barangay_id_unique_idx ON barangay_boundaries (barangay_id);
      CREATE INDEX IF NOT EXISTS evacuation_areas_barangay_id_idx ON evacuation_areas (barangay_id, is_active);
      CREATE INDEX IF NOT EXISTS incident_reports_assigned_barangay_id_idx ON incident_reports (assigned_barangay_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS user_notifications_barangay_id_idx ON user_notifications (barangay_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS flood_sensor_events_barangay_id_idx ON flood_sensor_alert_events (barangay_id, created_at DESC);

      CREATE OR REPLACE FUNCTION sync_barangay_reference()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        legacy_name TEXT;
        canonical_id SMALLINT;
      BEGIN
        legacy_name := to_jsonb(NEW) ->> TG_ARGV[0];
        IF legacy_name IS NULL OR BTRIM(legacy_name) = '' THEN
          RETURN NEW;
        END IF;

        SELECT id INTO canonical_id
        FROM barangays
        WHERE LOWER(name) = LOWER(BTRIM(legacy_name)) AND is_active = TRUE
        LIMIT 1;

        IF canonical_id IS NOT NULL THEN
          NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[1], canonical_id));
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS users_sync_barangay_reference ON users;
      CREATE TRIGGER users_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF barangay_name ON users
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('barangay_name', 'barangay_id');

      DROP TRIGGER IF EXISTS backup_requests_sync_barangay_reference ON backup_requests;
      CREATE TRIGGER backup_requests_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF barangay_name ON backup_requests
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('barangay_name', 'barangay_id');

      DROP TRIGGER IF EXISTS barangay_boundaries_sync_barangay_reference ON barangay_boundaries;
      CREATE TRIGGER barangay_boundaries_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF barangay_name ON barangay_boundaries
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('barangay_name', 'barangay_id');

      DROP TRIGGER IF EXISTS evacuation_areas_sync_barangay_reference ON evacuation_areas;
      CREATE TRIGGER evacuation_areas_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF barangay ON evacuation_areas
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('barangay', 'barangay_id');

      DROP TRIGGER IF EXISTS incident_reports_sync_barangay_reference ON incident_reports;
      CREATE TRIGGER incident_reports_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF assigned_barangay ON incident_reports
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('assigned_barangay', 'assigned_barangay_id');

      DROP TRIGGER IF EXISTS user_notifications_sync_barangay_reference ON user_notifications;
      CREATE TRIGGER user_notifications_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF barangay_name ON user_notifications
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('barangay_name', 'barangay_id');

      DROP TRIGGER IF EXISTS flood_sensor_events_sync_barangay_reference ON flood_sensor_alert_events;
      CREATE TRIGGER flood_sensor_events_sync_barangay_reference
        BEFORE INSERT OR UPDATE OF barangay_name ON flood_sensor_alert_events
        FOR EACH ROW EXECUTE FUNCTION sync_barangay_reference('barangay_name', 'barangay_id');
    `,
  },
  {
    version: 2,
    name: 'enforce_workflow_domains_and_query_indexes',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_valid') THEN
          ALTER TABLE users ADD CONSTRAINT users_role_valid
            CHECK (role IN ('admin', 'user', 'barangay', 'rescuer', 'barangay_rescuer')) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_reports_type_valid') THEN
          ALTER TABLE incident_reports ADD CONSTRAINT incident_reports_type_valid
            CHECK (report_type IN ('flood', 'rescue')) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_reports_status_valid') THEN
          ALTER TABLE incident_reports ADD CONSTRAINT incident_reports_status_valid
            CHECK (status IN ('pending', 'accepted', 'in_progress', 'resolved', 'declined')) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backup_requests_dispatch_type_valid') THEN
          ALTER TABLE backup_requests ADD CONSTRAINT backup_requests_dispatch_type_valid
            CHECK (dispatch_type IN ('cddrmd_backup', 'barangay_responder')) NOT VALID;
        END IF;
      END $$;

      ALTER TABLE users VALIDATE CONSTRAINT users_role_valid;
      ALTER TABLE incident_reports VALIDATE CONSTRAINT incident_reports_type_valid;
      ALTER TABLE incident_reports VALIDATE CONSTRAINT incident_reports_status_valid;
      ALTER TABLE backup_requests VALIDATE CONSTRAINT backup_requests_dispatch_type_valid;

      CREATE INDEX IF NOT EXISTS backup_requests_created_at_idx ON backup_requests (created_at DESC);
      CREATE INDEX IF NOT EXISTS flood_sensor_events_created_at_idx ON flood_sensor_alert_events (created_at DESC);
    `,
  },
  {
    version: 3,
    name: 'retire_empty_legacy_evacuation_tables',
    sql: `
      DO $$
      DECLARE
        table_name TEXT;
        contains_rows BOOLEAN;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'evacuation_admissions',
          'evacuation_count_logs',
          'evacuation_departures'
        ]
        LOOP
          IF to_regclass('public.' || table_name) IS NOT NULL THEN
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)', table_name)
              INTO contains_rows;

            IF contains_rows THEN
              RAISE NOTICE 'Keeping legacy table % because it contains data', table_name;
            ELSE
              EXECUTE format('DROP TABLE %I', table_name);
            END IF;
          END IF;
        END LOOP;
      END $$;
    `,
  },
  {
    version: 4,
    name: 'optimize_frequent_incident_reads',
    sql: `
      CREATE INDEX IF NOT EXISTS incident_reports_created_at_idx
        ON incident_reports (created_at DESC);
      CREATE INDEX IF NOT EXISTS incident_reports_type_created_at_idx
        ON incident_reports (report_type, created_at DESC);
    `,
  },
  {
    version: 5,
    name: 'repair_swapped_barangay_passwords',
    sql: `
      UPDATE users
      SET password_hash = barangay_name,
          barangay_name = password_hash
      WHERE role = 'barangay'
        AND LOWER(password_hash) IN ('palingon', 'lingga', 'sampiruhan', 'looc', 'uwisan', 'parian')
        AND LEFT(barangay_name, 4) IN ('$2a$', '$2b$', '$2y$');
    `,
  },
  {
    version: 6,
    name: 'reset_evacuation_occupancy_on_incident_truncate',
    sql: `
      CREATE OR REPLACE FUNCTION reset_evacuation_occupancy()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        UPDATE evacuation_areas
        SET evacuees = 0
        WHERE evacuees <> 0;
        RETURN NULL;
      END;
      $$;

      DROP TRIGGER IF EXISTS incident_reports_reset_evacuation_occupancy ON incident_reports;
      CREATE TRIGGER incident_reports_reset_evacuation_occupancy
        AFTER TRUNCATE ON incident_reports
        FOR EACH STATEMENT EXECUTE FUNCTION reset_evacuation_occupancy();
    `,
  },
  {
    version: 7,
    name: 'allow_staff_account_deletion_with_authored_content',
    sql: `
      ALTER TABLE alerts
        DROP CONSTRAINT IF EXISTS alerts_posted_by_fkey;
      ALTER TABLE alerts
        ADD CONSTRAINT alerts_posted_by_fkey
        FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL;

      ALTER TABLE announcements
        DROP CONSTRAINT IF EXISTS announcements_posted_by_fkey;
      ALTER TABLE announcements
        ADD CONSTRAINT announcements_posted_by_fkey
        FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL;
    `,
  },
  {
    version: 8,
    name: 'optimize_emergency_and_notification_queries',
    sql: `
      CREATE INDEX IF NOT EXISTS incident_reports_active_type_created_idx
        ON incident_reports (report_type, status, created_at DESC)
        WHERE status IN ('pending', 'accepted', 'in_progress');

      CREATE INDEX IF NOT EXISTS incident_reports_assigned_active_created_idx
        ON incident_reports (assigned_barangay_id, status, created_at DESC)
        WHERE assigned_barangay_id IS NOT NULL
          AND status IN ('pending', 'accepted', 'in_progress');

      CREATE INDEX IF NOT EXISTS incident_reports_incoming_evacuees_idx
        ON incident_reports (evacuation_area_id, status)
        INCLUDE (evacuees_reserved)
        WHERE report_type = 'rescue'
          AND evacuation_area_id IS NOT NULL
          AND evacuation_arrived_at IS NULL
          AND status IN ('accepted', 'in_progress');

      CREATE INDEX IF NOT EXISTS user_notifications_unread_created_idx
        ON user_notifications (user_id, created_at DESC)
        WHERE read_at IS NULL;

      CREATE INDEX IF NOT EXISTS users_active_role_barangay_idx
        ON users (role, barangay_id, id)
        WHERE is_archived = FALSE;

      CREATE INDEX IF NOT EXISTS evacuation_areas_active_name_idx
        ON evacuation_areas (name)
        WHERE is_active = TRUE;
    `,
  },
  {
    version: 9,
    name: 'add_resident_push_notification_delivery',
    sql: `
      CREATE TABLE IF NOT EXISTS user_device_push_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expo_push_token VARCHAR(255) NOT NULL UNIQUE,
        platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS push_attempted_at TIMESTAMPTZ;
      ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
      ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS push_error TEXT;

      CREATE INDEX IF NOT EXISTS user_device_push_tokens_user_active_idx
        ON user_device_push_tokens (user_id, is_active);
      CREATE INDEX IF NOT EXISTS user_notifications_pending_flood_push_idx
        ON user_notifications (created_at)
        WHERE category = 'flood_sensor' AND push_sent_at IS NULL;
    `,
  },
];

async function runSchemaMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of MIGRATIONS) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cddrmd_schema_migrations'))");
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [migration.version],
      );
      if (alreadyApplied.rowCount === 0) {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      error.message = `Schema migration ${migration.version} (${migration.name}) failed: ${error.message}`;
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = runSchemaMigrations;

