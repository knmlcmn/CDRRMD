const {
  AREA_RECONCILIATION_DISCLAIMER,
  CLUP_SOURCE_URL,
  DENSITY_FORMULA,
  LAND_AREA_SOURCE,
  POPULATION_SOURCE,
  buildPopulationDensityRecords,
} = require('../data/populationDensityData');
const {
  listPopulationRecords,
  updatePopulationRecord,
} = require('../services/populationDataService');

function isPopulationDensityLayerEnabled(environment = process.env) {
  return /^(1|true|yes|on)$/i.test(String(environment.POPULATION_DENSITY_GIS_ENABLED || '').trim());
}

function buildPopulationDensityPayload(environment = process.env, records = buildPopulationDensityRecords()) {
  const enabled = isPopulationDensityLayerEnabled(environment);
  return {
    schemaVersion: 2,
    enabled,
    defaultVisibility: false,
    readOnly: true,
    calculation: {
      formula: DENSITY_FORMULA,
      densityUnit: 'persons per square kilometer',
      derivedNotPsaPublished: true,
      boundaryGeometryUse: 'visualization only; never used to calculate land area',
    },
    sources: {
      population: POPULATION_SOURCE,
      landArea: LAND_AREA_SOURCE,
      clupUrl: CLUP_SOURCE_URL,
    },
    provenanceLimitations: [AREA_RECONCILIATION_DISCLAIMER],
    records: enabled ? records : [],
  };
}

async function getPopulationDensity(req, res) {
  res.set('Cache-Control', 'no-store');
  const enabled = isPopulationDensityLayerEnabled();
  const records = enabled ? await listPopulationRecords() : [];
  return res.json(buildPopulationDensityPayload(process.env, records));
}

async function getPopulationDataForAdmin(req, res) {
  res.set('Cache-Control', 'no-store');
  const records = await listPopulationRecords();
  return res.json({
    ...buildPopulationDensityPayload({ ...process.env, POPULATION_DENSITY_GIS_ENABLED: 'true' }, records),
    enabled: isPopulationDensityLayerEnabled(),
    readOnly: false,
    records,
  });
}

function parsePopulationUpdate(body, currentYear = new Date().getFullYear()) {
  const input = body && typeof body === 'object' ? body : {};
  const readOnlyFields = [
    'barangay',
    'landAreaHectares',
    'land_area_hectares',
    'densityPersonsPerSquareKilometer',
    'density_persons_per_square_kilometer',
    'densityClassification',
    'density_classification',
  ];
  if (readOnlyFields.some((field) => field in input)) {
    const error = new Error('Barangay name, land area, density, and classification are read-only.');
    error.status = 400;
    throw error;
  }

  const population = Number(input.population);
  const households = Number(input.households);
  const dataYear = Number(input.dataYear);
  const dataSource = String(input.dataSource ?? '').trim();

  if (!Number.isSafeInteger(population) || population < 0 || population > 2147483647) {
    const error = new Error('Population must be a non-negative whole number.');
    error.status = 400;
    throw error;
  }
  if (!Number.isSafeInteger(households) || households < 0 || households > 2147483647) {
    const error = new Error('Household count must be a non-negative whole number.');
    error.status = 400;
    throw error;
  }
  if (households > population) {
    const error = new Error('Household count must not exceed the population count.');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(dataYear) || dataYear < 1900 || dataYear > currentYear) {
    const error = new Error(`Data year must be between 1900 and ${currentYear}.`);
    error.status = 400;
    throw error;
  }
  if (!dataSource) {
    const error = new Error('Data source is required.');
    error.status = 400;
    throw error;
  }
  if (dataSource.length > 500) {
    const error = new Error('Data source must not exceed 500 characters.');
    error.status = 400;
    throw error;
  }

  return { population, households, dataYear, dataSource };
}

async function updatePopulationData(req, res) {
  const input = parsePopulationUpdate(req.body);
  const record = await updatePopulationRecord(req.params.barangay, input, req.user.userId);
  res.set('Cache-Control', 'no-store');
  return res.json({ message: `${record.barangay} population data updated successfully.`, record });
}

module.exports = {
  buildPopulationDensityPayload,
  getPopulationDataForAdmin,
  getPopulationDensity,
  isPopulationDensityLayerEnabled,
  parsePopulationUpdate,
  updatePopulationData,
};
