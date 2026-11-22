const {
  AREA_RECONCILIATION_DISCLAIMER,
  CLUP_SOURCE_URL,
  DENSITY_FORMULA,
  LAND_AREA_SOURCE,
  POPULATION_SOURCE,
  buildPopulationDensityRecords,
} = require('../data/populationDensityData');

function isPopulationDensityLayerEnabled(environment = process.env) {
  return /^(1|true|yes|on)$/i.test(String(environment.POPULATION_DENSITY_GIS_ENABLED || '').trim());
}

function buildPopulationDensityPayload(environment = process.env) {
  const enabled = isPopulationDensityLayerEnabled(environment);
  return {
    schemaVersion: 1,
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
    records: enabled ? buildPopulationDensityRecords() : [],
  };
}

function getPopulationDensity(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json(buildPopulationDensityPayload());
}

module.exports = {
  buildPopulationDensityPayload,
  getPopulationDensity,
  isPopulationDensityLayerEnabled,
};
