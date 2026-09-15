const bcrypt = require('bcryptjs');
const pool = require('./db');
const { resolveBarangayAtLocation } = require('../services/barangayJurisdictionService');

const SUPPORTED_BARANGAYS = [
  'Palingon',
  'Lingga',
  'Sampiruhan',
  'Looc',
  'Uwisan',
  'Parian',
];

const SUPPORTED_BARANGAY_SQL = SUPPORTED_BARANGAYS.map((name) => `'${name.toLowerCase()}'`).join(', ');

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(80) NOT NULL,
      email VARCHAR(160),
      first_name VARCHAR(120),
      last_name VARCHAR(120),
      address TEXT,
      contact_number VARCHAR(40),
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'admin',
      barangay_name VARCHAR(120),
      last_login TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      last_seen_at TIMESTAMP,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      archived_at TIMESTAMP,
      archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      body TEXT NOT NULL,
      category VARCHAR(60) NOT NULL DEFAULT 'general',
      severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      posted_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      body TEXT NOT NULL,
      posted_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS evacuation_areas (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      barangay VARCHAR(120) NOT NULL,
      place_type VARCHAR(120),
      address TEXT,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,
      evacuees INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS barangay_boundaries (
      id SERIAL PRIMARY KEY,
      barangay_name VARCHAR(120) NOT NULL UNIQUE,
      boundary_geojson JSONB,
      centroid_lat DOUBLE PRECISION,
      centroid_lon DOUBLE PRECISION,
      base_hazard VARCHAR(20) NOT NULL DEFAULT 'low',
      source VARCHAR(40) NOT NULL DEFAULT 'derived',
      notes TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS incident_reports (
      id SERIAL PRIMARY KEY,
      report_code VARCHAR(40) NOT NULL DEFAULT '',
      report_type VARCHAR(20) NOT NULL,
      location TEXT NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      assigned_barangay VARCHAR(120),
      incident_type VARCHAR(120) NOT NULL,
      water_level VARCHAR(60),
      are_people_trapped BOOLEAN,
      estimated_people INTEGER,
      notes TEXT,
      image_base64 TEXT,
      evacuation_area_id INTEGER REFERENCES evacuation_areas(id) ON DELETE SET NULL,
      evacuation_area_name VARCHAR(180),
      evacuees_reserved INTEGER NOT NULL DEFAULT 1,
      reported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS report_status_logs (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
      old_status VARCHAR(20),
      new_status VARCHAR(20) NOT NULL,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_note TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_id INTEGER REFERENCES incident_reports(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      body TEXT NOT NULL,
      read_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS flood_sensor_alert_events (
      id SERIAL PRIMARY KEY,
      event_key VARCHAR(160) NOT NULL,
      barangay_name VARCHAR(120) NOT NULL,
      hardware_no VARCHAR(80),
      level VARCHAR(20) NOT NULL,
      water_level_percentage DOUBLE PRECISION NOT NULL,
      sensor_updated_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (event_key, level)
    );

    CREATE TABLE IF NOT EXISTS user_refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(120) PRIMARY KEY,
      setting_value TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS assigned_barangay VARCHAR(120);

    CREATE INDEX IF NOT EXISTS incident_reports_assigned_barangay_idx
    ON incident_reports (LOWER(assigned_barangay), created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(160);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(120);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(120);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS address TEXT;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS category VARCHAR(60) NOT NULL DEFAULT 'report';

    ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'medium';

    ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS barangay_name VARCHAR(120);

    ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS source_event_key VARCHAR(160);

    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_username_key;

    ALTER TABLE evacuation_areas
    ADD COLUMN IF NOT EXISTS place_type VARCHAR(120);

    ALTER TABLE evacuation_areas
    ADD COLUMN IF NOT EXISTS address TEXT;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(200);

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS admin_notes TEXT;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(120);

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS decline_explanation TEXT;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS evacuation_area_id INTEGER REFERENCES evacuation_areas(id) ON DELETE SET NULL;

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS evacuation_area_name VARCHAR(180);

    ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS evacuees_reserved INTEGER NOT NULL DEFAULT 1;

    ALTER TABLE report_status_logs
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

    ALTER TABLE user_refresh_tokens
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS barangay_name VARCHAR(120);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS test_account_expires_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS users_barangay_name_idx
    ON users (barangay_name)
    WHERE barangay_name IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
    ON users (LOWER(email))
    WHERE email IS NOT NULL;

    CREATE INDEX IF NOT EXISTS users_is_archived_idx
    ON users (is_archived, role, created_at DESC);

    CREATE INDEX IF NOT EXISTS users_presence_idx
    ON users (role, last_seen_at DESC)
    WHERE role = 'barangay';

    CREATE UNIQUE INDEX IF NOT EXISTS barangay_boundaries_name_unique_idx
    ON barangay_boundaries (LOWER(barangay_name));

    CREATE INDEX IF NOT EXISTS barangay_boundaries_hazard_idx
    ON barangay_boundaries (base_hazard);

    CREATE UNIQUE INDEX IF NOT EXISTS incident_reports_report_code_unique_idx
    ON incident_reports (report_code)
    WHERE report_code <> '';

    CREATE INDEX IF NOT EXISTS incident_reports_reported_by_idx
    ON incident_reports (reported_by, created_at DESC);

    CREATE INDEX IF NOT EXISTS incident_reports_status_idx
    ON incident_reports (status, created_at DESC);

    CREATE INDEX IF NOT EXISTS report_status_logs_report_id_idx
    ON report_status_logs (report_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx
    ON user_notifications (user_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_flood_event_unique_idx
    ON user_notifications (user_id, source_event_key, severity)
    WHERE category = 'flood_sensor' AND source_event_key IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS user_refresh_tokens_hash_unique_idx
    ON user_refresh_tokens (token_hash);

    CREATE INDEX IF NOT EXISTS user_refresh_tokens_user_id_idx
    ON user_refresh_tokens (user_id, created_at DESC);

  `);

  await pool.query(`
    UPDATE users
    SET barangay_name = CASE
      WHEN LOWER(COALESCE(address, '')) LIKE '%palingon%' THEN 'Palingon'
      WHEN LOWER(COALESCE(address, '')) LIKE '%sampiruhan%' THEN 'Sampiruhan'
      WHEN LOWER(COALESCE(address, '')) LIKE '%lingga%' THEN 'Lingga'
      WHEN LOWER(COALESCE(address, '')) LIKE '%parian%' THEN 'Parian'
      WHEN LOWER(COALESCE(address, '')) LIKE '%looc%' THEN 'Looc'
      WHEN LOWER(COALESCE(address, '')) LIKE '%uwisan%' THEN 'Uwisan'
      ELSE barangay_name
    END
    WHERE role = 'user' AND COALESCE(barangay_name, '') = '';
  `);

  // One-time migration for reports created before jurisdiction assignment was
  // stored. Reports outside all supported polygons remain unassigned and are
  // intentionally invisible to every barangay portal.
  const unassignedReports = await pool.query(
    `SELECT id, latitude, longitude
     FROM incident_reports
     WHERE assigned_barangay IS NULL
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL`,
  );
  for (const report of unassignedReports.rows) {
    const barangayName = resolveBarangayAtLocation(report.latitude, report.longitude);
    if (barangayName) {
      await pool.query(
        'UPDATE incident_reports SET assigned_barangay = $1 WHERE id = $2 AND assigned_barangay IS NULL',
        [barangayName, report.id],
      );
    }
  }

  const evacuationSeedState = await pool.query(
    `SELECT setting_key FROM system_settings
     WHERE setting_key = 'evacuation_areas_seed_completed'
     LIMIT 1`,
  );

  if (evacuationSeedState.rows.length === 0) {
    const existingEvacuationAreas = await pool.query('SELECT COUNT(*)::int AS count FROM evacuation_areas');

    // Populate defaults only for a genuinely empty installation. An existing
    // database may already have customized or intentionally deleted centers.
    if (Number(existingEvacuationAreas.rows[0]?.count || 0) === 0) {
      await pool.query(
       `INSERT INTO evacuation_areas (name, barangay, place_type, address, latitude, longitude, capacity, evacuees, is_active)
      SELECT seed.name, seed.barangay, seed.place_type, seed.address, seed.latitude, seed.longitude, seed.capacity, seed.evacuees, seed.is_active
     FROM (
      VALUES
        ('Lingga Elementary School', 'Lingga', 'Elementary School', 'Barangay Lingga, Calamba City, Laguna, Philippines', 14.2156960, 121.1796961, 160, 0, TRUE),
        ('Looc Elementary School', 'Looc', 'Elementary School', 'Barangay Looc, Calamba City, Laguna, Philippines', 14.2224303, 121.1748345, 150, 0, TRUE),
        ('Parian Elementary School', 'Parian', 'Elementary School', 'Barangay Parian, Calamba City, Laguna, Philippines', 14.2144420, 121.1485544, 180, 0, TRUE),
        ('Cardinal Village Basketball Court', 'Sampiruhan', 'Covered Court', 'Cardinal Village, Barangay Sampiruhan, Calamba City, Laguna, Philippines', 14.2182800, 121.1802900, 170, 0, TRUE),
        ('Calamba Bayside Integrated School', 'Palingon', 'Integrated School', 'Barangay Palingon, Calamba City, Laguna, Philippines', 14.2156165, 121.1835861, 170, 0, TRUE),
        ('Uwisan Elementary School', 'Uwisan', 'Elementary School', 'Barangay Uwisan, Calamba City, Laguna, Philippines', 14.2381600, 121.1720600, 140, 0, TRUE)
      ) AS seed(name, barangay, place_type, address, latitude, longitude, capacity, evacuees, is_active)
     WHERE NOT EXISTS (
       SELECT 1 FROM evacuation_areas ea WHERE LOWER(ea.name) = LOWER(seed.name)
     )`,
      );
    }

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('evacuation_areas_seed_completed', 'true')
       ON CONFLICT (setting_key) DO NOTHING`,
    );
  }

  await pool.query(
    `DELETE FROM evacuation_areas
     WHERE LOWER(barangay) NOT IN (${SUPPORTED_BARANGAY_SQL})`,
  );

  const evacuationBoundaryRepairState = await pool.query(
    `SELECT setting_key FROM system_settings
     WHERE setting_key = 'evacuation_area_boundary_repair_v1'
     LIMIT 1`,
  );

  if (evacuationBoundaryRepairState.rows.length === 0) {
    // Repair the legacy placeholder/geocoder records with verified facilities.
    // The coordinates below use the same OSM geography as the dashboard layer.
    await pool.query(
      `UPDATE evacuation_areas
       SET name = 'Parian Covered Court',
           barangay = 'Parian',
           place_type = 'Covered Court',
           address = 'Barangay Parian, Calamba City, Laguna, Philippines'
       WHERE LOWER(name) = 'court'
         AND latitude BETWEEN 14.2149 AND 14.2154
         AND longitude BETWEEN 121.1513 AND 121.1520`,
    );
    await pool.query(
      `UPDATE evacuation_areas
       SET barangay = 'Sampiruhan',
           address = 'Santan Street, Barangay Sampiruhan, Calamba City, Laguna, Philippines'
       WHERE LOWER(name) = 'sampiruhan elem school'`,
    );
    await pool.query(
      `UPDATE evacuation_areas
       SET latitude = 14.2150625,
           longitude = 121.185015625,
           barangay = 'Palingon',
           address = 'Barangay Palingon, Calamba City, Laguna, Philippines'
       WHERE LOWER(name) = 'pamahalaang brgy. palingon'`,
    );
    await pool.query(
      `UPDATE evacuation_areas
       SET name = 'Cardinal Village Basketball Court',
           latitude = 14.2182800,
           longitude = 121.1802900,
           barangay = 'Sampiruhan',
           place_type = 'Covered Court',
           address = 'Cardinal Village, Barangay Sampiruhan, Calamba City, Laguna, Philippines'
       WHERE LOWER(name) = 'sampiruhan covered court'`,
    );

    const evacuationRows = await pool.query(
      'SELECT id, barangay, latitude, longitude FROM evacuation_areas',
    );
    for (const area of evacuationRows.rows) {
      const boundaryBarangay = resolveBarangayAtLocation(area.latitude, area.longitude);
      if (boundaryBarangay && boundaryBarangay.toLowerCase() !== String(area.barangay || '').toLowerCase()) {
        await pool.query('UPDATE evacuation_areas SET barangay = $1 WHERE id = $2', [boundaryBarangay, area.id]);
      }
    }

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('evacuation_area_boundary_repair_v1', 'true')
       ON CONFLICT (setting_key) DO NOTHING`,
    );
  }

  const evacuationBoundaryRepairV2State = await pool.query(
    `SELECT setting_key FROM system_settings
     WHERE setting_key = 'evacuation_area_boundary_repair_v2'
     LIMIT 1`,
  );

  if (evacuationBoundaryRepairV2State.rows.length === 0) {
    const verifiedAreaRepairs = [
      {
        targetName: 'Lingga Elementary School',
        legacyNames: ['Lingga Multi-purpose Hall'],
        barangay: 'Lingga',
        placeType: 'Elementary School',
        address: 'Barangay Lingga, Calamba City, Laguna, Philippines',
        latitude: 14.2156960,
        longitude: 121.1796961,
      },
      {
        targetName: 'Looc Elementary School',
        legacyNames: ['Looc Multi-purpose Hall'],
        barangay: 'Looc',
        placeType: 'Elementary School',
        address: 'Barangay Looc, Calamba City, Laguna, Philippines',
        latitude: 14.2224303,
        longitude: 121.1748345,
      },
      {
        targetName: 'Parian Elementary School',
        legacyNames: ['Parian Multi-purpose Hall'],
        barangay: 'Parian',
        placeType: 'Elementary School',
        address: 'Barangay Parian, Calamba City, Laguna, Philippines',
        latitude: 14.2144420,
        longitude: 121.1485544,
      },
      {
        targetName: 'Cardinal Village Basketball Court',
        legacyNames: ['Sampiruhan Covered Court'],
        barangay: 'Sampiruhan',
        placeType: 'Covered Court',
        address: 'Cardinal Village, Barangay Sampiruhan, Calamba City, Laguna, Philippines',
        latitude: 14.2182800,
        longitude: 121.1802900,
      },
      {
        targetName: 'Calamba Bayside Integrated School',
        legacyNames: ['Palingon Covered Court'],
        barangay: 'Palingon',
        placeType: 'Integrated School',
        address: 'Barangay Palingon, Calamba City, Laguna, Philippines',
        latitude: 14.2156165,
        longitude: 121.1835861,
      },
      {
        targetName: 'Uwisan Elementary School',
        legacyNames: ['Uwisan Elementary School'],
        barangay: 'Uwisan',
        placeType: 'Elementary School',
        address: 'Barangay Uwisan, Calamba City, Laguna, Philippines',
        latitude: 14.2381600,
        longitude: 121.1720600,
      },
    ];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const repair of verifiedAreaRepairs) {
        const candidateNames = [...new Set([repair.targetName, ...repair.legacyNames])];
        const candidates = await client.query(
          `SELECT id, name
           FROM evacuation_areas
           WHERE LOWER(name) = ANY($1::text[])
           ORDER BY CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END, id ASC`,
          [candidateNames.map((name) => name.toLowerCase()), repair.targetName],
        );
        if (candidates.rows.length === 0) continue;

        const target = candidates.rows[0];
        await client.query(
          `UPDATE evacuation_areas
           SET name = $1,
               barangay = $2,
               place_type = $3,
               address = $4,
               latitude = $5,
               longitude = $6
           WHERE id = $7`,
          [
            repair.targetName,
            repair.barangay,
            repair.placeType,
            repair.address,
            repair.latitude,
            repair.longitude,
            target.id,
          ],
        );

        for (const duplicate of candidates.rows.slice(1)) {
          await client.query(
            `UPDATE incident_reports
             SET evacuation_area_id = $1,
                 evacuation_area_name = $2
             WHERE evacuation_area_id = $3`,
            [target.id, repair.targetName, duplicate.id],
          );
          await client.query('DELETE FROM evacuation_areas WHERE id = $1', [duplicate.id]);
        }

        await client.query(
          `UPDATE incident_reports
           SET evacuation_area_name = $1
           WHERE evacuation_area_id = $2`,
          [repair.targetName, target.id],
        );
      }

      await client.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('evacuation_area_boundary_repair_v2', 'true')
         ON CONFLICT (setting_key) DO NOTHING`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  await pool.query(
    `INSERT INTO barangay_boundaries (barangay_name, centroid_lat, centroid_lon, base_hazard, source, notes)
     VALUES
       ('Palingon',   14.2145, 121.1886, 'high',     'seed', 'Supported barangay centroid'),
       ('Lingga',     14.2050, 121.1734, 'high',     'seed', 'Supported barangay centroid'),
       ('Sampiruhan', 14.2145, 121.1801, 'high',     'seed', 'Supported barangay centroid'),
       ('Looc',       14.2050, 121.1819, 'high',     'seed', 'Supported barangay centroid'),
       ('Uwisan',     14.1990, 121.1411, 'moderate', 'seed', 'Supported barangay centroid'),
       ('Parian',     14.2050, 121.1904, 'high',     'seed', 'Supported barangay centroid')
     ON CONFLICT (barangay_name) DO UPDATE
     SET
       centroid_lat = COALESCE(NULLIF(barangay_boundaries.centroid_lat, 0), EXCLUDED.centroid_lat),
       centroid_lon = COALESCE(NULLIF(barangay_boundaries.centroid_lon, 0), EXCLUDED.centroid_lon),
       base_hazard = COALESCE(NULLIF(barangay_boundaries.base_hazard, ''), EXCLUDED.base_hazard),
       updated_at = NOW()`,
  );

  await pool.query(
    `DELETE FROM barangay_boundaries
     WHERE LOWER(barangay_name) NOT IN (${SUPPORTED_BARANGAY_SQL})`,
  );

  await pool.query(
    `DELETE FROM users
     WHERE role = 'barangay'
       AND LOWER(COALESCE(barangay_name, '')) NOT IN (${SUPPORTED_BARANGAY_SQL})`,
  );

  // Default accounts are for local development only. Production deployments
  // must create staff credentials explicitly rather than exposing known passwords.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEFAULT_ACCOUNTS !== 'true') {
    return;
  }

  const username = 'admin';
  const email = 'admin@cddrmd.local';
  const password = 'Admin@123';

  const existingByEmail = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) ORDER BY id ASC LIMIT 1',
    [email],
  );
  const existingByUsername = await pool.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) ORDER BY id ASC LIMIT 1',
    [username],
  );

  const adminSeedId = existingByEmail.rows[0]?.id || existingByUsername.rows[0]?.id || null;

  if (!adminSeedId) {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [username, email, passwordHash, 'admin'],
    );
  } else {
    await pool.query(
      `UPDATE users
       SET
         username = COALESCE(username, $1),
         email = COALESCE(email, $2),
         role = 'admin',
         is_archived = FALSE,
         archived_at = NULL,
         archived_by = NULL
       WHERE id = $3`,
      [username, email, adminSeedId],
    );
  }

  const secondaryAdminUsername = 'cdrrmd_admin';
  const secondaryAdminEmail = 'cdrrmd.admin@calamba.gov.ph';
  const secondaryAdminExisting = await pool.query(
    `SELECT id
     FROM users
     WHERE username = $1 OR LOWER(email) = LOWER($2)
     ORDER BY id ASC
     LIMIT 1`,
    [secondaryAdminUsername, secondaryAdminEmail],
  );

  if (secondaryAdminExisting.rows.length === 0) {
    const secondaryAdminPasswordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')`,
      [secondaryAdminUsername, secondaryAdminEmail, secondaryAdminPasswordHash],
    );
  } else {
    await pool.query(
      `UPDATE users
       SET
         username = COALESCE(username, $1),
         email = COALESCE(email, $2),
         role = 'admin'
       WHERE id = $3`,
      [secondaryAdminUsername, secondaryAdminEmail, secondaryAdminExisting.rows[0].id],
    );
  }

  // ── Barangay role migrations ─────────────────────────────────────────────
  // Seed one barangay rescue account per supported jurisdiction. Each account
  // manages rescue/incident requests only within its own barangay boundary.
  const brgyPassword = 'Brgy@123';
  const brgyPasswordHash = await bcrypt.hash(brgyPassword, 10);

  for (const barangayDisplayName of SUPPORTED_BARANGAYS) {
    const slug = barangayDisplayName.toLowerCase();
    const brgyUsername = `brgy_${slug}`;
    const brgyEmail = `${slug}@calamba.gov.ph`;

    const brgyExisting = await pool.query(
      `SELECT id FROM users WHERE username = $1 OR LOWER(email) = LOWER($2) ORDER BY id ASC LIMIT 1`,
      [brgyUsername, brgyEmail],
    );

    if (brgyExisting.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role, barangay_name, is_active)
         VALUES ($1, $2, $3, 'barangay', $4, TRUE)`,
        [brgyUsername, brgyEmail, brgyPasswordHash, barangayDisplayName],
      );
    } else {
      await pool.query(
        `UPDATE users
         SET role = 'barangay',
             barangay_name = $2,
             is_active = TRUE
         WHERE id = $1`,
        [brgyExisting.rows[0].id, barangayDisplayName],
      );
    }
  }
}

module.exports = initDb;
