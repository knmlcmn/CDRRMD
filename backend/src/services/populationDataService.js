const pool = require('../config/db');
const cache = require('./cacheService');

const CACHE_KEY = 'gis:population-density:records';
const CACHE_TTL_MS = 30_000;

const RECORD_SELECT = `
  SELECT b.name AS barangay,
         pr.population,
         pr.households,
         pr.land_area_hectares::double precision AS "landAreaHectares",
         TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM pr.land_area_hectares::text)) AS "landAreaPublishedValue",
         pr.data_year AS "populationYear",
         pr.data_source AS "dataSource",
         pr.density_persons_per_square_kilometer::double precision AS "densityPersonsPerSquareKilometer",
         pr.density_classification AS "densityClassification",
         pr.updated_at AS "updatedAt",
         pr.updated_by AS "updatedBy",
         COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username) AS "updatedByName"
  FROM barangay_population_records pr
  JOIN barangays b ON b.id = pr.barangay_id
  LEFT JOIN users u ON u.id = pr.updated_by
`;

async function queryPopulationRecords(client = pool) {
  const result = await client.query(`${RECORD_SELECT} ORDER BY b.name ASC`);
  return result.rows.map((row) => ({ ...row, densityIsDerived: true }));
}

async function listPopulationRecords() {
  const { value } = await cache.getOrLoad(
    CACHE_KEY,
    { ttlMs: CACHE_TTL_MS },
    () => queryPopulationRecords(),
  );
  return value;
}

async function updatePopulationRecord(barangayName, input, administratorId, dependencies = {}) {
  const database = dependencies.pool || pool;
  const cacheStore = dependencies.cache || cache;
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT pr.barangay_id
       FROM barangay_population_records pr
       JOIN barangays b ON b.id = pr.barangay_id
       WHERE LOWER(b.name) = LOWER($1)
       FOR UPDATE`,
      [barangayName],
    );
    if (existing.rowCount === 0) {
      const error = new Error('Population record not found.');
      error.status = 404;
      throw error;
    }

    await client.query(
      `UPDATE barangay_population_records
       SET population = $1,
           households = $2,
           data_year = $3,
           data_source = $4,
           updated_at = NOW(),
           updated_by = $5
       WHERE barangay_id = $6`,
      [input.population, input.households, input.dataYear, input.dataSource, administratorId, existing.rows[0].barangay_id],
    );
    const result = await client.query(
      `${RECORD_SELECT} WHERE pr.barangay_id = $1`,
      [existing.rows[0].barangay_id],
    );
    await client.query('COMMIT');
    await cacheStore.remove(CACHE_KEY);
    return { ...result.rows[0], densityIsDerived: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  CACHE_KEY,
  listPopulationRecords,
  queryPopulationRecords,
  updatePopulationRecord,
};
