const pool = require('../config/db');
const { SUPPORTED_BARANGAYS } = require('../services/supportedBarangays');

const PAGE_SIZE = 20;
const SUPPORTED_KEYS = SUPPORTED_BARANGAYS.map((name) => name.toLowerCase());

function parseFilters(req) {
  const page = Math.max(1, Number.parseInt(String(req.query?.page || '1'), 10) || 1);
  const month = req.query?.month ? Number(req.query.month) : null;
  const year = req.query?.year ? Number(req.query.year) : null;
  const search = String(req.query?.search || '').trim().toLowerCase().slice(0, 120);
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    const error = new Error('Month must be between 1 and 12.');
    error.status = 400;
    throw error;
  }
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    const error = new Error('Enter a valid year.');
    error.status = 400;
    throw error;
  }
  return { page, month, year, search, offset: (page - 1) * PAGE_SIZE };
}

function historyScope(req) {
  if (!['admin', 'barangay'].includes(req.user?.role)) {
    const error = new Error('Admin or barangay access required.');
    error.status = 403;
    throw error;
  }
  const barangayName = req.user.role === 'barangay' ? String(req.user.barangayName || '').trim() : null;
  if (req.user.role === 'barangay' && !barangayName) {
    const error = new Error('No barangay is assigned to this account.');
    error.status = 403;
    throw error;
  }
  return barangayName;
}

function paginatedResponse(rows, filters) {
  const total = Number(rows[0]?.total_count || 0);
  return {
    items: rows.map(({ total_count: _totalCount, ...item }) => item),
    page: filters.page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

async function listIncidentHistory(req, res) {
  const barangayName = historyScope(req);
  const filters = parseFilters(req);
  const { rows } = await pool.query(
    `SELECT r.id, r.report_code, r.report_type, r.incident_type, r.status, r.location,
            r.assigned_barangay, r.evacuation_area_name, r.created_at, r.resolved_at,
            NULLIF(TRIM(CONCAT_WS(' ', reporter.first_name, reporter.last_name)), '') AS reporter_name,
            CONCAT('USR-', EXTRACT(YEAR FROM reporter.created_at)::text, '-', LPAD(reporter.id::text, 5, '0')) AS reporter_account_id,
            COUNT(*) OVER() AS total_count
     FROM incident_reports r
     LEFT JOIN users reporter ON reporter.id = r.reported_by
     WHERE LOWER(r.assigned_barangay) = ANY($1::text[])
       AND ($2::text IS NULL OR LOWER(r.assigned_barangay) = LOWER($2))
       AND ($3::integer IS NULL OR EXTRACT(MONTH FROM r.created_at) = $3)
       AND ($4::integer IS NULL OR EXTRACT(YEAR FROM r.created_at) = $4)
       AND ($5::text = ''
         OR LOWER(COALESCE(r.report_code, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(CONCAT_WS(' ', reporter.first_name, reporter.last_name), '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(r.location, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(r.assigned_barangay, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(CONCAT('USR-', EXTRACT(YEAR FROM reporter.created_at)::text, '-', LPAD(reporter.id::text, 5, '0')), '')) LIKE '%' || $5 || '%')
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $6 OFFSET $7`,
    [SUPPORTED_KEYS, barangayName, filters.month, filters.year, filters.search, PAGE_SIZE, filters.offset],
  );
  return res.json(paginatedResponse(rows, filters));
}

async function listBackupHistory(req, res) {
  const barangayName = historyScope(req);
  const filters = parseFilters(req);
  const { rows } = await pool.query(
    `SELECT br.id, br.barangay_name, br.created_at, br.acknowledged_at, br.declined_at,
            br.decline_reason, br.assigned_at, br.picked_up_at, br.arrived_at,
            ir.report_code, ir.location, ir.status AS report_status,
            NULLIF(TRIM(CONCAT_WS(' ', requester.first_name, requester.last_name)), '') AS requested_by_name,
            NULLIF(TRIM(CONCAT_WS(' ', rescuer.first_name, rescuer.last_name)), '') AS rescuer_name,
            CONCAT('RSC-', EXTRACT(YEAR FROM rescuer.created_at)::text, '-', LPAD(rescuer.id::text, 5, '0')) AS rescuer_account_id,
            COUNT(*) OVER() AS total_count
     FROM backup_requests br
     LEFT JOIN incident_reports ir ON ir.id = br.report_id
     LEFT JOIN users requester ON requester.id = br.requested_by
     LEFT JOIN users rescuer ON rescuer.id = br.assigned_rescuer_id
     WHERE br.dispatch_type = 'cddrmd_backup'
       AND LOWER(br.barangay_name) = ANY($1::text[])
       AND ($2::text IS NULL OR LOWER(br.barangay_name) = LOWER($2))
       AND ($3::integer IS NULL OR EXTRACT(MONTH FROM br.created_at) = $3)
       AND ($4::integer IS NULL OR EXTRACT(YEAR FROM br.created_at) = $4)
       AND ($5::text = ''
         OR LOWER(COALESCE(ir.report_code, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(br.barangay_name, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(CONCAT_WS(' ', requester.first_name, requester.last_name), '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(CONCAT_WS(' ', rescuer.first_name, rescuer.last_name), '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(CONCAT('BKP-', EXTRACT(YEAR FROM br.created_at)::text, '-', LPAD(br.id::text, 5, '0')), '')) LIKE '%' || $5 || '%')
     ORDER BY br.created_at DESC, br.id DESC
     LIMIT $6 OFFSET $7`,
    [SUPPORTED_KEYS, barangayName, filters.month, filters.year, filters.search, PAGE_SIZE, filters.offset],
  );
  return res.json(paginatedResponse(rows, filters));
}

async function listWaterLevelHistory(req, res) {
  const barangayName = historyScope(req);
  const filters = parseFilters(req);
  const { rows } = await pool.query(
    `SELECT e.id, e.event_key, e.barangay_name, e.hardware_no, e.level,
            e.water_level_percentage, e.sensor_updated_at, e.created_at,
            COUNT(*) OVER() AS total_count
     FROM flood_sensor_alert_events e
     WHERE LOWER(e.barangay_name) = ANY($1::text[])
       AND ($2::text IS NULL OR LOWER(e.barangay_name) = LOWER($2))
       AND ($3::integer IS NULL OR EXTRACT(MONTH FROM e.created_at) = $3)
       AND ($4::integer IS NULL OR EXTRACT(YEAR FROM e.created_at) = $4)
       AND ($5::text = ''
         OR LOWER(COALESCE(e.event_key, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(e.hardware_no, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(e.barangay_name, '')) LIKE '%' || $5 || '%'
         OR LOWER(COALESCE(e.level, '')) LIKE '%' || $5 || '%')
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $6 OFFSET $7`,
    [SUPPORTED_KEYS, barangayName, filters.month, filters.year, filters.search, PAGE_SIZE, filters.offset],
  );
  return res.json(paginatedResponse(rows, filters));
}

module.exports = { listIncidentHistory, listBackupHistory, listWaterLevelHistory };
