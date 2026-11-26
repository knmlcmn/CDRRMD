const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AREA_RECONCILIATION_DISCLAIMER,
  DENSITY_FORMULA,
  VERIFIED_BARANGAY_INPUTS,
  calculateDensityPersonsPerSquareKilometer,
  classifyPopulationDensity,
} = require('../src/data/populationDensityData');
const {
  buildPopulationDensityPayload,
  getPopulationDensity,
  isPopulationDensityLayerEnabled,
  parsePopulationUpdate,
} = require('../src/controllers/populationDensityController');

const expectedInputs = {
  Parian: [31735, 9254, 112.0, '112.0', 40, 28334.82, 'High'],
  Looc: [33300, 9691, 179.1, '179.1', 27, 18592.96, 'Elevated'],
  Uwisan: [3689, 1027, 78.0, '78.0', 54, 4729.49, 'Low'],
  Palingon: [6518, 1814, 15.3, '15.3', 37, 42601.31, 'Very High'],
  Lingga: [7690, 2140, 45.0, '45.0', 26, 17088.89, 'Elevated'],
  Sampiruhan: [11754, 3271, 81.0, '81.0', 46, 14511.11, 'Moderate'],
};

test('population density feature flag is disabled by default and accepts explicit true values only', () => {
  assert.equal(isPopulationDensityLayerEnabled({}), false);
  assert.equal(isPopulationDensityLayerEnabled({ POPULATION_DENSITY_GIS_ENABLED: 'false' }), false);
  assert.equal(isPopulationDensityLayerEnabled({ POPULATION_DENSITY_GIS_ENABLED: 'true' }), true);
  assert.equal(isPopulationDensityLayerEnabled({ POPULATION_DENSITY_GIS_ENABLED: '1' }), true);
});

test('disabled payload is read-only, default-off, and does not expose layer records', () => {
  const payload = buildPopulationDensityPayload({});
  assert.equal(payload.enabled, false);
  assert.equal(payload.defaultVisibility, false);
  assert.equal(payload.readOnly, true);
  assert.deepEqual(payload.records, []);
  assert.equal(payload.calculation.formula, DENSITY_FORMULA);
  assert.match(payload.calculation.boundaryGeometryUse, /visualization only/i);
});

test('verified population, household, and published area inputs retain exact initial values', () => {
  assert.equal(VERIFIED_BARANGAY_INPUTS.length, 6);
  for (const input of VERIFIED_BARANGAY_INPUTS) {
    const [population, households, area, publishedArea, barangayId] = expectedInputs[input.barangay];
    assert.equal(input.population, population);
    assert.equal(input.households, households);
    assert.equal(input.landAreaHectares, area);
    assert.equal(input.landAreaPublishedValue, publishedArea);
    assert.equal(input.households <= input.population, true);
    assert.match(input.landAreaSourceUrl, new RegExp(`brgyId=${barangayId}$`));
  }
  assert.equal(VERIFIED_BARANGAY_INPUTS.reduce((total, item) => total + item.population, 0), 94686);
  assert.equal(VERIFIED_BARANGAY_INPUTS.reduce((total, item) => total + item.households, 0), 27197);
});

test('enabled payload derives density from population divided by square-kilometer area', () => {
  const payload = buildPopulationDensityPayload({ POPULATION_DENSITY_GIS_ENABLED: 'true' });
  assert.equal(payload.enabled, true);
  assert.equal(payload.records.length, 6);
  for (const record of payload.records) {
    const expected = calculateDensityPersonsPerSquareKilometer(record.population, record.landAreaHectares);
    assert.equal(record.densityPersonsPerSquareKilometer, Number(expected.toFixed(2)));
    const expectedRecord = expectedInputs[record.barangay];
    assert.equal(record.populationYear, 2026);
    assert.equal(record.dataSource, 'City Social Services Department');
    assert.equal(record.densityPersonsPerSquareKilometer, expectedRecord[5]);
    assert.equal(record.densityClassification, expectedRecord[6]);
    assert.equal(record.densityClassification, classifyPopulationDensity(expected));
    assert.equal(record.households > 0, true);
    assert.equal(record.densityIsDerived, true);
  }
});

test('payload uses the full City Social Services Department source and preserves the land-area limitation', () => {
  const payload = buildPopulationDensityPayload({ POPULATION_DENSITY_GIS_ENABLED: 'true' });
  assert.equal(payload.sources.population.publisher, 'City Social Services Department');
  assert.equal(payload.sources.population.censusYear, 2026);
  assert.doesNotMatch(JSON.stringify(payload), /Philippine Statistics Authority|PSA|2024 POPCEN/);
  assert.equal(payload.provenanceLimitations[0], AREA_RECONCILIATION_DISCLAIMER);
  assert.match(payload.provenanceLimitations[0], /14,480-hectare city total/);
});

test('HTTP controller disables caching so the rollback flag takes effect immediately', async () => {
  const headers = {};
  let responseBody = null;
  const response = {
    set(name, value) { headers[name] = value; },
    json(value) { responseBody = value; return value; },
  };
  await getPopulationDensity({}, response);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(responseBody.defaultVisibility, false);
});

test('population update validation accepts editable fields and rejects invalid or read-only values', () => {
  assert.deepEqual(parsePopulationUpdate({
    population: 100,
    households: 25,
    dataYear: 2026,
    dataSource: ' CDRRMD validated survey ',
  }, 2026), {
    population: 100,
    households: 25,
    dataYear: 2026,
    dataSource: 'CDRRMD validated survey',
  });
  assert.throws(() => parsePopulationUpdate({ population: 1.5, households: 1, dataYear: 2026, dataSource: 'Survey' }, 2026), /whole number/);
  assert.throws(() => parsePopulationUpdate({ population: 10, households: 11, dataYear: 2026, dataSource: 'Survey' }, 2026), /must not exceed/);
  assert.throws(() => parsePopulationUpdate({ population: 10, households: 2, dataYear: 2027, dataSource: 'Survey' }, 2026), /between 1900 and 2026/);
  assert.throws(() => parsePopulationUpdate({ population: 10, households: 2, dataYear: 2026, dataSource: ' ' }, 2026), /required/);
  assert.throws(() => parsePopulationUpdate({ population: 10, households: 2, dataYear: 2026, dataSource: 'Survey', landAreaHectares: 999 }, 2026), /read-only/);
});

test('population update authorization rejects every non-admin role', () => {
  const { requireAdmin } = require('../src/routes/gisRoutes');
  for (const role of ['barangay', 'barangay_rescuer', 'rescuer', 'user']) {
    let statusCode = null;
    let body = null;
    let continued = false;
    requireAdmin(
      { user: { role } },
      { status(code) { statusCode = code; return this; }, json(value) { body = value; return value; } },
      () => { continued = true; },
    );
    assert.equal(statusCode, 403);
    assert.match(body.message, /Administrator access required/);
    assert.equal(continued, false);
  }
  let continued = false;
  requireAdmin({ user: { role: 'admin' } }, {}, () => { continued = true; });
  assert.equal(continued, true);
});

test('population migration is additive and never overwrites an existing administrator update', () => {
  const { MIGRATIONS } = require('../src/config/schemaMigrations');
  const migration = MIGRATIONS.find((item) => item.version === 11);
  assert.equal(migration.name, 'add_current_barangay_population_records');
  assert.match(migration.sql, /GENERATED ALWAYS AS/);
  assert.match(migration.sql, /updated_by INTEGER REFERENCES users/);
  assert.match(migration.sql, /ON CONFLICT \(barangay_id\) DO NOTHING/);
  assert.doesNotMatch(migration.sql, /ON CONFLICT[\s\S]*DO UPDATE/);
  assert.match(migration.sql, /seed\.land_area_hectares, 2026/);
  assert.match(migration.sql, /'City Social Services Department'/);
  for (const [barangay, values] of Object.entries(expectedInputs)) {
    assert.match(migration.sql, new RegExp(`\\('${barangay}', ${values[0]}, ${values[1]},`));
  }
  assert.doesNotMatch(migration.sql, /Philippine Statistics Authority|PSA|2024 POPCEN/);
  const densityExpression = migration.sql.match(/density_persons_per_square_kilometer[\s\S]+?STORED/)?.[0] || '';
  assert.doesNotMatch(densityExpression, /households/);
});
