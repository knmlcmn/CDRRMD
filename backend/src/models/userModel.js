const pool = require('../config/db');

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND COALESCE(is_archived, FALSE) = FALSE',
    [email],
  );
  return result.rows[0] || null;
}

async function findUserByUsername(username) {
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND COALESCE(is_archived, FALSE) = FALSE',
    [username],
  );
  return result.rows[0] || null;
}

async function findStaffByAccountId(accountId, role) {
  const prefix = role === 'admin' ? 'ADM' : role === 'barangay' ? 'BRG' : role === 'rescuer' ? 'RSC' : role === 'barangay_rescuer' ? 'BRS' : null;
  if (!prefix) return null;
  const result = await pool.query(
    `SELECT * FROM users
     WHERE role = $1
       AND COALESCE(is_archived, FALSE) = FALSE
       AND UPPER($2::text) = CONCAT($3::text, '-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0'))
     LIMIT 1`,
    [role, accountId, prefix],
  );
  return result.rows[0] || null;
}

async function findPublicUserById(id) {
  const result = await pool.query(
    `SELECT id, username, email, first_name, last_name, address, contact_number, role, barangay_name,
            verification_status, created_at
     FROM users
     WHERE id = $1
       AND COALESCE(is_archived, FALSE) = FALSE
     LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function createUser(user) {
  const result = await pool.query(
    `INSERT INTO users (
      username,
      email,
      first_name,
      last_name,
      address,
      contact_number,
      password_hash,
      role,
      barangay_name,
      valid_id_image,
      verification_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, username, email, first_name, last_name, address, contact_number, role, barangay_name,
              verification_status, created_at`,
    [
      user.username,
      user.email,
      user.firstName,
      user.lastName,
      user.address,
      user.contactNumber,
      user.passwordHash,
      user.role,
      user.barangayName,
      user.validIdImage,
      user.verificationStatus || 'approved',
    ],
  );

  return result.rows[0];
}

async function updateMyProfile(userId, profile) {
  const result = await pool.query(
    `UPDATE users
     SET
       first_name = $1,
       last_name = $2,
       email = $3,
       address = $4,
       contact_number = $5,
       password_hash = COALESCE($6, password_hash)
     WHERE id = $7
     RETURNING id, username, role, email, first_name, last_name, address, contact_number, barangay_name, created_at`,
    [
      profile.firstName,
      profile.lastName,
      profile.email,
      profile.address,
      profile.contactNumber,
      profile.passwordHash || null,
      userId,
    ],
  );

  return result.rows[0] || null;
}

async function assignResidentBarangayFromLocation(userId, barangayName, latitude, longitude) {
  const result = await pool.query(
    `UPDATE users
     SET barangay_name = $2,
         current_latitude = $3,
         current_longitude = $4,
         current_barangay_name = $2,
         location_updated_at = NOW()
     WHERE id = $1
       AND role = 'user'
       AND verification_status = 'approved'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id, username, role, email, first_name, last_name, address,
               contact_number, barangay_name, created_at`,
    [userId, barangayName, latitude, longitude],
  );

  return result.rows[0] || null;
}

async function findDuplicateEmailForUser(email, userId) {
  const result = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
    [email, userId],
  );
  return result.rows[0] || null;
}

async function listAdmins() {
  const result = await pool.query(
    `SELECT id,
            CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS admin_id,
            username,
            email,
            first_name,
            last_name,
            address,
            contact_number,
            role,
            created_at,
            COALESCE(is_active, FALSE) AS is_active,
            last_login
     FROM users
     WHERE role = 'admin'
       AND COALESCE(is_archived, FALSE) = FALSE
     ORDER BY id ASC`,
  );
  return result.rows;
}

async function listUsers() {
  const result = await pool.query(
    `SELECT id,
            CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
            username,
            email,
            first_name,
            last_name,
            address,
            contact_number,
            role,
            verification_status,
            created_at
     FROM users
     WHERE role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
     ORDER BY CASE WHEN verification_status = 'pending' THEN 0 ELSE 1 END, id DESC`,
  );
  return result.rows;
}

async function listArchivedAdmins() {
  const result = await pool.query(
    `SELECT id,
            CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS admin_id,
            username,
            email,
            first_name,
            last_name,
            address,
            contact_number,
            role,
            created_at,
            archived_at
     FROM users
     WHERE role = 'admin'
       AND COALESCE(is_archived, FALSE) = TRUE
     ORDER BY archived_at DESC NULLS LAST, id DESC`,
  );
  return result.rows;
}

async function listArchivedUsers() {
  const result = await pool.query(
    `SELECT id,
            CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
            username,
            email,
            first_name,
            last_name,
            address,
            contact_number,
            role,
            created_at,
            archived_at
     FROM users
     WHERE role = 'user'
       AND COALESCE(is_archived, FALSE) = TRUE
     ORDER BY archived_at DESC NULLS LAST, id DESC`,
  );
  return result.rows;
}

async function findDuplicateAdmin(email, username, ignoreId = null) {
  if (ignoreId) {
    const result = await pool.query(
      `SELECT id
       FROM users
       WHERE (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2))
         AND id <> $3
       LIMIT 1`,
      [email, username, ignoreId],
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT id
     FROM users
     WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)
     LIMIT 1`,
    [email, username],
  );
  return result.rows[0] || null;
}

async function findDuplicateUser(email, username, ignoreId = null) {
  if (ignoreId) {
    const result = await pool.query(
      `SELECT id
       FROM users
       WHERE (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2))
         AND id <> $3
       LIMIT 1`,
      [email, username, ignoreId],
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT id
     FROM users
     WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)
     LIMIT 1`,
    [email, username],
  );
  return result.rows[0] || null;
}

async function createAdmin(admin) {
  const result = await pool.query(
    `INSERT INTO users (
      username,
      email,
      first_name,
      last_name,
      address,
      contact_number,
      password_hash,
      role
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin')
    RETURNING id,
          CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS admin_id,
          username,
          email,
          first_name,
          last_name,
          address,
          contact_number,
          role,
          created_at`,
    [
      admin.username,
      admin.email,
      admin.firstName,
      admin.lastName,
      admin.address,
      admin.contactNumber,
      admin.passwordHash,
    ],
  );
  return result.rows[0];
}

async function createUserByAdmin(user) {
  const result = await pool.query(
    `INSERT INTO users (
      username,
      email,
      first_name,
      last_name,
      address,
      contact_number,
      password_hash,
      role
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'user')
    RETURNING id,
          CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
          username,
          email,
          first_name,
          last_name,
          address,
          contact_number,
          role,
          created_at`,
    [
      user.username,
      user.email,
      user.firstName,
      user.lastName,
      user.address,
      user.contactNumber,
      user.passwordHash,
    ],
  );
  return result.rows[0];
}

async function findAdminById(id) {
  const result = await pool.query(
    `SELECT id
     FROM users
     WHERE id = $1
       AND role = $2
       AND COALESCE(is_archived, FALSE) = FALSE
     LIMIT 1`,
    [id, 'admin'],
  );
  return result.rows[0] || null;
}

async function findUserByIdForAdmin(id) {
  const result = await pool.query(
    `SELECT id
     FROM users
     WHERE id = $1
       AND role = $2
       AND COALESCE(is_archived, FALSE) = FALSE
     LIMIT 1`,
    [id, 'user'],
  );
  return result.rows[0] || null;
}

async function getUserVerificationById(id) {
  const result = await pool.query(
    `SELECT id,
            CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
            username, email, first_name, last_name, address, contact_number,
            valid_id_image, verification_status, verification_reviewed_at, created_at
     FROM users
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
     LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function reviewUserVerification(id, status, reviewedBy) {
  const result = await pool.query(
    `UPDATE users
     SET verification_status = $2::varchar,
         verification_reviewed_at = NOW(),
         verification_reviewed_by = $3,
         is_active = CASE WHEN $2::varchar = 'disapproved' THEN FALSE ELSE is_active END
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id, verification_status, verification_reviewed_at`,
    [id, status, reviewedBy],
  );
  return result.rows[0] || null;
}

async function resubmitUserVerification(id, validIdImage) {
  const result = await pool.query(
    `UPDATE users
     SET valid_id_image = $2,
         verification_status = 'pending',
         verification_reviewed_at = NULL,
         verification_reviewed_by = NULL,
         is_active = FALSE
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id, username, email, first_name, last_name, address, contact_number,
               role, barangay_name, verification_status, created_at`,
    [id, validIdImage],
  );
  return result.rows[0] || null;
}

async function updateAdmin(admin) {
  if (admin.passwordHash) {
    const result = await pool.query(
      `UPDATE users
       SET
         username = $1,
         email = $2,
         first_name = $3,
         last_name = $4,
         address = $5,
         contact_number = $6,
         password_hash = $7,
         role = 'admin'
       WHERE id = $8
      RETURNING id,
           CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS admin_id,
           username,
           email,
           first_name,
           last_name,
           address,
           contact_number,
           role,
           created_at`,
      [
        admin.username,
        admin.email,
        admin.firstName,
        admin.lastName,
        admin.address,
        admin.contactNumber,
        admin.passwordHash,
        admin.id,
      ],
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `UPDATE users
     SET
       username = $1,
       email = $2,
       first_name = $3,
       last_name = $4,
       address = $5,
       contact_number = $6,
       role = 'admin'
     WHERE id = $7
    RETURNING id,
        CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS admin_id,
        username,
        email,
        first_name,
        last_name,
        address,
        contact_number,
        role,
        created_at`,
    [admin.username, admin.email, admin.firstName, admin.lastName, admin.address, admin.contactNumber, admin.id],
  );
  return result.rows[0] || null;
}

async function updateUserById(user) {
  if (user.passwordHash) {
    const result = await pool.query(
      `UPDATE users
       SET
         username = $1,
         email = $2,
         first_name = $3,
         last_name = $4,
         address = $5,
         contact_number = $6,
         password_hash = $7,
         role = 'user'
       WHERE id = $8
      RETURNING id,
           CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
           username,
           email,
           first_name,
           last_name,
           address,
           contact_number,
           role,
           created_at`,
      [
        user.username,
        user.email,
        user.firstName,
        user.lastName,
        user.address,
        user.contactNumber,
        user.passwordHash,
        user.id,
      ],
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `UPDATE users
     SET
       username = $1,
       email = $2,
       first_name = $3,
       last_name = $4,
       address = $5,
       contact_number = $6,
       role = 'user'
     WHERE id = $7
    RETURNING id,
        CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
        username,
        email,
        first_name,
        last_name,
        address,
        contact_number,
        role,
        created_at`,
    [user.username, user.email, user.firstName, user.lastName, user.address, user.contactNumber, user.id],
  );
  return result.rows[0] || null;
}

async function archiveAdminById(id, archivedBy) {
  const result = await pool.query(
    `UPDATE users
     SET
       is_archived = TRUE,
       archived_at = NOW(),
       archived_by = $2
     WHERE id = $1
       AND role = 'admin'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id`,
    [id, archivedBy],
  );
  return result.rows[0] || null;
}

async function restoreAdminById(id) {
  const result = await pool.query(
    `UPDATE users
     SET
       is_archived = FALSE,
       archived_at = NULL,
       archived_by = NULL
     WHERE id = $1
       AND role = 'admin'
       AND COALESCE(is_archived, FALSE) = TRUE
     RETURNING id,
        CONCAT('ADM-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS admin_id,
        username,
        email,
        first_name,
        last_name,
        address,
        contact_number,
        role,
        created_at`,
    [id],
  );
  return result.rows[0] || null;
}

async function permanentlyDeleteAdminById(id) {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id = $1
       AND role = 'admin'
       AND COALESCE(is_archived, FALSE) = TRUE
     RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}

async function archiveUserById(id, archivedBy) {
  const result = await pool.query(
    `UPDATE users
     SET
       is_archived = TRUE,
       archived_at = NOW(),
       archived_by = $2
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id`,
    [id, archivedBy],
  );
  return result.rows[0] || null;
}

async function restoreUserById(id) {
  const result = await pool.query(
    `UPDATE users
     SET
       is_archived = FALSE,
       archived_at = NULL,
       archived_by = NULL
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = TRUE
     RETURNING id,
        CONCAT('USR-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS user_id,
        username,
        email,
        first_name,
        last_name,
        address,
        contact_number,
        role,
        created_at`,
    [id],
  );
  return result.rows[0] || null;
}

async function permanentlyDeleteUserById(id) {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = TRUE
     RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}

async function deleteUserById(id) {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id = $1
       AND role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}

// ── Barangay account functions ────────────────────────────────────────────

async function listBarangayAccounts() {
  const result = await pool.query(
    `SELECT id,
            CONCAT('BRG-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS barangay_id,
            username,
            email,
            first_name,
            last_name,
            address,
            contact_number,
            role,
            barangay_name,
            created_at,
            (
              COALESCE(is_active, FALSE) = TRUE
              AND last_seen_at >= NOW() - INTERVAL '45 seconds'
            ) AS is_active,
            last_login,
            last_seen_at
     FROM users
     WHERE role = 'barangay'
       AND COALESCE(is_archived, FALSE) = FALSE
     ORDER BY LOWER(barangay_name) ASC, LOWER(last_name) ASC, LOWER(first_name) ASC, id ASC`,
  );
  return result.rows;
}

async function listArchivedBarangayAccounts() {
  const result = await pool.query(
    `SELECT id,
            CONCAT('BRG-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS barangay_id,
            username, email, first_name, last_name, address, contact_number,
            role, barangay_name, created_at, archived_at,
            COALESCE(is_active, FALSE) AS is_active, last_login
     FROM users
     WHERE role = 'barangay'
       AND COALESCE(is_archived, FALSE) = TRUE
     ORDER BY LOWER(barangay_name) ASC, LOWER(last_name) ASC, LOWER(first_name) ASC, id ASC`,
  );
  return result.rows;
}

async function touchBarangayPresence(userId) {
  const result = await pool.query(
    `UPDATE users
     SET is_active = TRUE, last_seen_at = NOW()
     WHERE id = $1
       AND role = 'barangay'
       AND COALESCE(is_archived, FALSE) = FALSE
     RETURNING id, last_seen_at`,
    [userId],
  );
  return result.rows[0] || null;
}

async function markBarangayOffline(userId) {
  const result = await pool.query(
    `UPDATE users
     SET is_active = FALSE, last_seen_at = NOW()
     WHERE id = $1 AND role = 'barangay'
     RETURNING id`,
    [userId],
  );
  return result.rows[0] || null;
}

async function createBarangayAccount(account) {
  const result = await pool.query(
    `INSERT INTO users (
      username, email, first_name, last_name, address, contact_number,
      password_hash, role, barangay_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'barangay', $8)
    RETURNING id,
      CONCAT('BRG-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS barangay_id,
      username, email, first_name, last_name, address, contact_number, role, barangay_name, created_at`,
    [
      account.username, account.email, account.firstName, account.lastName,
      account.address, account.contactNumber, account.passwordHash, account.barangayName,
    ],
  );
  return result.rows[0];
}

async function updateBarangayAccount(account) {
  const baseFields = [
    account.username, account.email, account.firstName, account.lastName,
    account.address, account.contactNumber, account.barangayName,
  ];
  if (account.passwordHash) {
    const result = await pool.query(
      `UPDATE users
       SET username=$1, email=$2, first_name=$3, last_name=$4, address=$5,
           contact_number=$6, password_hash=$7, barangay_name=$8
       WHERE id=$9 AND role='barangay'
       RETURNING id,
         CONCAT('BRG-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS barangay_id,
         username, email, first_name, last_name, address, contact_number, role, barangay_name, created_at`,
      [...baseFields, account.passwordHash, account.id],
    );
    return result.rows[0] || null;
  }
  const result = await pool.query(
    `UPDATE users
     SET username=$1, email=$2, first_name=$3, last_name=$4, address=$5,
         contact_number=$6, barangay_name=$7
     WHERE id=$8 AND role='barangay'
     RETURNING id,
       CONCAT('BRG-', EXTRACT(YEAR FROM created_at)::text, '-', LPAD(id::text, 5, '0')) AS barangay_id,
       username, email, first_name, last_name, address, contact_number, role, barangay_name, created_at`,
    [...baseFields, account.id],
  );
  return result.rows[0] || null;
}

async function archiveBarangayById(id, archivedBy) {
  const result = await pool.query(
    `UPDATE users SET is_archived=TRUE, archived_at=NOW(), archived_by=$2
     WHERE id=$1 AND role='barangay' AND COALESCE(is_archived,FALSE)=FALSE
     RETURNING id`,
    [id, archivedBy],
  );
  return result.rows[0] || null;
}

async function restoreBarangayById(id) {
  const result = await pool.query(
    `UPDATE users
     SET is_archived=FALSE, archived_at=NULL, archived_by=NULL, is_active=FALSE
     WHERE id=$1 AND role='barangay' AND COALESCE(is_archived,FALSE)=TRUE
     RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}

async function permanentlyDeleteBarangayById(id) {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id=$1 AND role='barangay' AND COALESCE(is_archived,FALSE)=TRUE
     RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}

async function findBarangayById(id) {
  const result = await pool.query(
    `SELECT id, barangay_name FROM users WHERE id=$1 AND role='barangay' AND COALESCE(is_archived,FALSE)=FALSE LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function findDuplicateBarangay(email, username, ignoreId = null) {
  if (ignoreId) {
    const result = await pool.query(
      `SELECT id FROM users WHERE (LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2)) AND id<>$3 LIMIT 1`,
      [email, username, ignoreId],
    );
    return result.rows[0] || null;
  }
  const result = await pool.query(
    `SELECT id FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2) LIMIT 1`,
    [email, username],
  );
  return result.rows[0] || null;
}

// Reports filtered by barangay jurisdiction (by lat/lon intersection with barangay boundary)
async function listReportsByEvacuationAreaBarangay(barangayName) {
  const result = await pool.query(
    `SELECT
       ir.id,
       ir.report_code,
       ir.report_type,
       ir.location,
       ir.latitude,
       ir.longitude,
       ir.incident_type,
       ir.water_level,
       ir.are_people_trapped,
       ir.estimated_people,
       ir.notes,
       ir.image_base64,
       ir.status,
       ir.evacuation_area_id,
       ir.evacuation_area_name,
       ir.evacuees_reserved,
       ir.assigned_team,
       ir.admin_notes,
       ir.decline_reason,
       ir.decline_explanation,
       ir.dispatched_at,
       ir.resolved_at,
       ir.updated_at,
       ir.created_at,
       u.id AS reporter_id,
       u.first_name,
       u.last_name,
       u.contact_number,
       u.email
     FROM incident_reports ir
     JOIN users u ON u.id = ir.reported_by
     LEFT JOIN evacuation_areas ea ON ea.id = ir.evacuation_area_id
     WHERE LOWER(COALESCE(ea.barangay, ir.evacuation_area_name, '')) = LOWER($1)
     ORDER BY ir.created_at DESC`,
    [barangayName],
  );
  return result.rows;
}

async function listReportsByAssignedBarangay(barangayName) {
  const result = await pool.query(
    `SELECT
       ir.id, ir.report_code, ir.report_type, ir.location,
       CASE WHEN u.location_updated_at >= NOW() - INTERVAL '5 minutes'
              AND u.current_latitude IS NOT NULL AND u.current_longitude IS NOT NULL
            THEN u.current_latitude ELSE ir.latitude END AS latitude,
       CASE WHEN u.location_updated_at >= NOW() - INTERVAL '5 minutes'
              AND u.current_latitude IS NOT NULL AND u.current_longitude IS NOT NULL
            THEN u.current_longitude ELSE ir.longitude END AS longitude,
       ir.assigned_barangay, ir.incident_type, ir.water_level,
       ir.are_people_trapped, ir.estimated_people, ir.notes, ir.image_base64,
       ir.status, ir.evacuation_area_id, ir.evacuation_area_name,
       ir.evacuees_reserved, ir.assigned_team, ir.admin_notes,
       ir.decline_reason, ir.decline_explanation,
       ir.dispatched_at, ir.resolved_at, ir.updated_at, ir.created_at,
       ir.evacuation_arrived_at, ir.departure_requested_at, ir.departure_confirmed_at,
       u.id AS reporter_id, u.first_name, u.last_name, u.contact_number, u.email,
       dispatch.id AS dispatch_id, dispatch.dispatch_type, dispatch.assigned_rescuer_id,
       dispatch.assigned_at AS rescuer_assigned_at, dispatch.responder_acknowledged_at, dispatch.picked_up_at,
       NULLIF(TRIM(CONCAT_WS(' ', responder.first_name, responder.last_name)), '') AS rescuer_name,
       responder.current_latitude AS rescuer_latitude,
       responder.current_longitude AS rescuer_longitude,
       responder.location_updated_at AS rescuer_location_updated_at
     FROM incident_reports ir
     JOIN users u ON u.id = ir.reported_by
     LEFT JOIN LATERAL (
       SELECT br.id, br.dispatch_type, br.assigned_rescuer_id, br.assigned_at, br.responder_acknowledged_at, br.picked_up_at
       FROM backup_requests br
       WHERE br.report_id = ir.id AND br.assigned_rescuer_id IS NOT NULL
         AND br.arrived_at IS NULL AND br.declined_at IS NULL
       ORDER BY CASE WHEN br.dispatch_type = 'cddrmd_backup' THEN 0 ELSE 1 END,
         br.assigned_at DESC NULLS LAST, br.id DESC
       LIMIT 1
     ) dispatch ON TRUE
     LEFT JOIN users responder ON responder.id = dispatch.assigned_rescuer_id
     WHERE LOWER(ir.assigned_barangay) = LOWER($1)
       AND ir.report_type = 'rescue'
     ORDER BY ir.created_at DESC`,
    [barangayName],
  );
  return result.rows;
}

async function listReportsByBarangayName(barangayName) {
  const result = await pool.query(
    `SELECT
       ir.id,
       ir.report_code,
       ir.report_type,
       ir.location,
       ir.latitude,
       ir.longitude,
       ir.incident_type,
       ir.water_level,
       ir.are_people_trapped,
       ir.estimated_people,
       ir.notes,
       ir.image_base64,
       ir.status,
       ir.evacuation_area_id,
       ir.evacuation_area_name,
       ir.evacuees_reserved,
       ir.assigned_team,
       ir.admin_notes,
       ir.decline_reason,
       ir.decline_explanation,
       ir.dispatched_at,
       ir.resolved_at,
       ir.updated_at,
       ir.created_at,
       u.id AS reporter_id,
       u.first_name,
       u.last_name,
       u.contact_number,
       u.email
     FROM incident_reports ir
     JOIN users u ON u.id = ir.reported_by
     WHERE ir.latitude IS NOT NULL
       AND ir.longitude IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM barangay_boundaries bb
         WHERE LOWER(bb.barangay_name) = LOWER($1)
           AND bb.boundary_geojson IS NOT NULL
           AND ST_Contains(
             ST_SetSRID(ST_GeomFromGeoJSON(bb.boundary_geojson::text), 4326),
             ST_SetSRID(ST_MakePoint(ir.longitude, ir.latitude), 4326)
           )
       )
     ORDER BY ir.created_at DESC`,
    [barangayName],
  );
  return result.rows;
}

// Fallback: match by nearest barangay centroid when PostGIS not available
// (kept for backwards compatibility but no longer called directly)
async function listReportsByBarangayNameFallback(barangayName) {
  const result = await pool.query(
    `SELECT
       ir.id, ir.report_code, ir.report_type, ir.location,
       ir.latitude, ir.longitude, ir.incident_type, ir.water_level,
       ir.are_people_trapped, ir.estimated_people, ir.notes, ir.image_base64,
       ir.status, ir.evacuation_area_id, ir.evacuation_area_name,
       ir.evacuees_reserved, ir.assigned_team, ir.admin_notes,
       ir.decline_reason, ir.decline_explanation,
       ir.dispatched_at, ir.resolved_at, ir.updated_at, ir.created_at,
       u.id AS reporter_id, u.first_name, u.last_name, u.contact_number, u.email
     FROM incident_reports ir
     JOIN users u ON u.id = ir.reported_by
     WHERE ir.latitude IS NOT NULL AND ir.longitude IS NOT NULL
     ORDER BY (
       SELECT ((ir.latitude - bb.centroid_lat)^2 + (ir.longitude - bb.centroid_lon)^2)
       FROM barangay_boundaries bb
       WHERE LOWER(bb.barangay_name) = LOWER($1)
       LIMIT 1
     ) ASC,
     ir.created_at DESC
     LIMIT 200`,
    [barangayName],
  );
  return result.rows;
}

// Layer 2 fallback: use centroid distance but FILTER — only include reports whose
// nearest barangay centroid IS this barangay (no PostGIS needed).
async function listReportsByBarangayCentroid(barangayName) {
  const result = await pool.query(
    `WITH target AS (
       SELECT centroid_lat, centroid_lon
       FROM barangay_boundaries
       WHERE LOWER(barangay_name) = LOWER($1)
       LIMIT 1
     ),
     all_centroids AS (
       SELECT barangay_name, centroid_lat, centroid_lon FROM barangay_boundaries
     )
     SELECT
       ir.id, ir.report_code, ir.report_type, ir.location,
       ir.latitude, ir.longitude, ir.incident_type, ir.water_level,
       ir.are_people_trapped, ir.estimated_people, ir.notes, ir.image_base64,
       ir.status, ir.evacuation_area_id, ir.evacuation_area_name,
       ir.evacuees_reserved, ir.assigned_team, ir.admin_notes,
       ir.decline_reason, ir.decline_explanation,
       ir.dispatched_at, ir.resolved_at, ir.updated_at, ir.created_at,
       u.id AS reporter_id, u.first_name, u.last_name, u.contact_number, u.email
     FROM incident_reports ir
     JOIN users u ON u.id = ir.reported_by
     CROSS JOIN target t
     WHERE ir.latitude IS NOT NULL
       AND ir.longitude IS NOT NULL
       AND (
         -- Include if this barangay's centroid is the nearest one
         SELECT LOWER(ac.barangay_name)
         FROM all_centroids ac
         ORDER BY ((ir.latitude - ac.centroid_lat)^2 + (ir.longitude - ac.centroid_lon)^2) ASC
         LIMIT 1
       ) = LOWER($1)
     ORDER BY ir.created_at DESC`,
    [barangayName],
  );
  return result.rows;
}

// Layer 3 fallback: text-based location match — catches reports where the
// location field explicitly mentions the barangay name. Requires no geometry at all.
async function listReportsByLocationText(barangayName) {
  const result = await pool.query(
    `SELECT
       ir.id, ir.report_code, ir.report_type, ir.location,
       ir.latitude, ir.longitude, ir.incident_type, ir.water_level,
       ir.are_people_trapped, ir.estimated_people, ir.notes, ir.image_base64,
       ir.status, ir.evacuation_area_id, ir.evacuation_area_name,
       ir.evacuees_reserved, ir.assigned_team, ir.admin_notes,
       ir.decline_reason, ir.decline_explanation,
       ir.dispatched_at, ir.resolved_at, ir.updated_at, ir.created_at,
       u.id AS reporter_id, u.first_name, u.last_name, u.contact_number, u.email
     FROM incident_reports ir
     JOIN users u ON u.id = ir.reported_by
     WHERE LOWER(ir.location) LIKE LOWER($1)
     ORDER BY ir.created_at DESC`,
    [`%${barangayName}%`],
  );
  return result.rows;
}

module.exports = {
  findUserByEmail,
  findUserByUsername,
  findStaffByAccountId,
  findPublicUserById,
  createUser,
  updateMyProfile,
  assignResidentBarangayFromLocation,
  findDuplicateEmailForUser,
  listAdmins,
  listUsers,
  findDuplicateAdmin,
  findDuplicateUser,
  createAdmin,
  findAdminById,
  findUserByIdForAdmin,
  getUserVerificationById,
  reviewUserVerification,
  resubmitUserVerification,
  updateAdmin,
  updateUserById,
  listArchivedAdmins,
  listArchivedUsers,
  archiveAdminById,
  restoreAdminById,
  permanentlyDeleteAdminById,
  createUserByAdmin,
  archiveUserById,
  restoreUserById,
  permanentlyDeleteUserById,
  deleteUserById,
  // barangay
  listBarangayAccounts,
  touchBarangayPresence,
  markBarangayOffline,
  listArchivedBarangayAccounts,
  createBarangayAccount,
  updateBarangayAccount,
  archiveBarangayById,
  restoreBarangayById,
  permanentlyDeleteBarangayById,
  findBarangayById,
  findDuplicateBarangay,
  listReportsByEvacuationAreaBarangay,
  listReportsByAssignedBarangay,
  listReportsByBarangayName,
  listReportsByBarangayNameFallback,
  listReportsByBarangayCentroid,
  listReportsByLocationText,
};
