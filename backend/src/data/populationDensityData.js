const POPULATION_SOURCE = Object.freeze({
  publisher: 'Philippine Statistics Authority (PSA)',
  title: 'City of Calamba barangays — 2024 Census of Population (2024 POPCEN)',
  censusYear: 2024,
  url: 'https://psa.gov.ph/classification/psgc/barangays/0403405000',
  officialTableCatalogUrl: 'https://psa.gov.ph/statistics/population-and-housing/stat-tables?page=2',
});

const LAND_AREA_SOURCE = Object.freeze({
  publisher: 'City Government of Calamba',
  title: 'Official barangay profile — Geography: Land Area',
  unit: 'hectares',
  measurementYear: null,
});

const CLUP_SOURCE_URL = 'https://mail.calambacity.gov.ph/images/OtherAttachments/FinalDraftCLUP2017-2026.pdf';
const DENSITY_FORMULA = 'population / (landAreaHectares / 100)';
const AREA_RECONCILIATION_DISCLAIMER =
  'Land areas are the values published in official Calamba City barangay profiles. The Calamba CLUP 2017–2026 notes that the official 14,480-hectare city total had not yet been correspondingly allocated among barangays and recommends reconciliation; the profile pages do not state the land-area measurement year.';

const VERIFIED_BARANGAY_INPUTS = Object.freeze([
  Object.freeze({
    barangay: 'Parian',
    population: 27378,
    landAreaHectares: 112.0,
    landAreaPublishedValue: '112.0',
    landAreaSourceUrl: 'https://www.calambacity.gov.ph/Users/Barangay/ViewBrgyDetails?brgyId=40',
  }),
  Object.freeze({
    barangay: 'Looc',
    population: 29364,
    landAreaHectares: 179.1,
    landAreaPublishedValue: '179.1',
    landAreaSourceUrl: 'https://calambacity.gov.ph/Users/Barangay/ViewBrgyDetails?brgyId=27',
  }),
  Object.freeze({
    barangay: 'Uwisan',
    population: 6724,
    landAreaHectares: 78.0,
    landAreaPublishedValue: '78.0',
    landAreaSourceUrl: 'https://calambacity.gov.ph/Users/Barangay/ViewBrgyDetails?brgyId=54',
  }),
  Object.freeze({
    barangay: 'Palingon',
    population: 6046,
    landAreaHectares: 15.3,
    landAreaPublishedValue: '15.3',
    landAreaSourceUrl: 'https://calambacity.gov.ph/Users/Barangay/ViewBrgyDetails?brgyId=37',
  }),
  Object.freeze({
    barangay: 'Lingga',
    population: 6662,
    landAreaHectares: 45.0,
    landAreaPublishedValue: '45.0',
    landAreaSourceUrl: 'https://calambacity.gov.ph/Users/Barangay/ViewBrgyDetails?brgyId=26',
  }),
  Object.freeze({
    barangay: 'Sampiruhan',
    population: 9740,
    landAreaHectares: 81.0,
    landAreaPublishedValue: '81.0',
    landAreaSourceUrl: 'https://calambacity.gov.ph/Users/Barangay/ViewBrgyDetails?brgyId=46',
  }),
]);

function calculateDensityPersonsPerSquareKilometer(population, landAreaHectares) {
  const populationNumber = Number(population);
  const areaNumber = Number(landAreaHectares);
  if (!Number.isFinite(populationNumber) || populationNumber < 0) {
    throw new TypeError('Population must be a non-negative finite number.');
  }
  if (!Number.isFinite(areaNumber) || areaNumber <= 0) {
    throw new TypeError('Land area must be a positive finite number.');
  }
  return populationNumber / (areaNumber / 100);
}

function buildPopulationDensityRecords() {
  return VERIFIED_BARANGAY_INPUTS.map((input) => Object.freeze({
    ...input,
    populationYear: POPULATION_SOURCE.censusYear,
    densityPersonsPerSquareKilometer: Number(
      calculateDensityPersonsPerSquareKilometer(input.population, input.landAreaHectares).toFixed(2),
    ),
    densityIsDerived: true,
  }));
}

module.exports = {
  AREA_RECONCILIATION_DISCLAIMER,
  CLUP_SOURCE_URL,
  DENSITY_FORMULA,
  LAND_AREA_SOURCE,
  POPULATION_SOURCE,
  VERIFIED_BARANGAY_INPUTS,
  buildPopulationDensityRecords,
  calculateDensityPersonsPerSquareKilometer,
};
