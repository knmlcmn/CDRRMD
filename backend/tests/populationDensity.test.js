const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AREA_RECONCILIATION_DISCLAIMER,
  DENSITY_FORMULA,
  VERIFIED_BARANGAY_INPUTS,
  calculateDensityPersonsPerSquareKilometer,
} = require('../src/data/populationDensityData');
const {
  buildPopulationDensityPayload,
  getPopulationDensity,
  isPopulationDensityLayerEnabled,
} = require('../src/controllers/populationDensityController');

const expectedInputs = {
  Parian: [27378, 112.0, '112.0', 40],
  Looc: [29364, 179.1, '179.1', 27],
  Uwisan: [6724, 78.0, '78.0', 54],
  Palingon: [6046, 15.3, '15.3', 37],
  Lingga: [6662, 45.0, '45.0', 26],
  Sampiruhan: [9740, 81.0, '81.0', 46],
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

test('verified population and published area inputs retain exact official source URLs', () => {
  assert.equal(VERIFIED_BARANGAY_INPUTS.length, 6);
  for (const input of VERIFIED_BARANGAY_INPUTS) {
    const [population, area, publishedArea, barangayId] = expectedInputs[input.barangay];
    assert.equal(input.population, population);
    assert.equal(input.landAreaHectares, area);
    assert.equal(input.landAreaPublishedValue, publishedArea);
    assert.match(input.landAreaSourceUrl, new RegExp(`brgyId=${barangayId}$`));
  }
});

test('enabled payload derives density from population divided by square-kilometer area', () => {
  const payload = buildPopulationDensityPayload({ POPULATION_DENSITY_GIS_ENABLED: 'true' });
  assert.equal(payload.enabled, true);
  assert.equal(payload.records.length, 6);
  for (const record of payload.records) {
    const expected = calculateDensityPersonsPerSquareKilometer(record.population, record.landAreaHectares);
    assert.equal(record.densityPersonsPerSquareKilometer, Number(expected.toFixed(2)));
    assert.equal(record.populationYear, 2024);
    assert.equal(record.densityIsDerived, true);
  }
});

test('payload preserves PSA attribution and the CLUP reconciliation limitation', () => {
  const payload = buildPopulationDensityPayload({ POPULATION_DENSITY_GIS_ENABLED: 'true' });
  assert.match(payload.sources.population.publisher, /Philippine Statistics Authority/);
  assert.equal(payload.sources.population.censusYear, 2024);
  assert.match(payload.sources.population.url, /^https:\/\/psa\.gov\.ph\//);
  assert.equal(payload.provenanceLimitations[0], AREA_RECONCILIATION_DISCLAIMER);
  assert.match(payload.provenanceLimitations[0], /14,480-hectare city total/);
});

test('HTTP controller disables caching so the rollback flag takes effect immediately', () => {
  const headers = {};
  let responseBody = null;
  const response = {
    set(name, value) { headers[name] = value; },
    json(value) { responseBody = value; return value; },
  };
  getPopulationDensity({}, response);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(responseBody.defaultVisibility, false);
});
