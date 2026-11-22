const TEST_MODE_PREFIX = '[TEST MODE]';

function buildReportPresentation({ incidentType, details, testModeEnabled }) {
  const normalizedIncidentType = String(incidentType || '').trim() || 'Request Rescue';
  const normalizedDetails = String(details || '').trim() || 'Rescue request submitted via mobile app.';
  if (testModeEnabled !== true) {
    return { incidentType: normalizedIncidentType, details: normalizedDetails };
  }
  return {
    incidentType: `${TEST_MODE_PREFIX} ${normalizedIncidentType}`,
    details: `${TEST_MODE_PREFIX} Synthetic workflow test. Keep the submitted GPS coordinates for validation; authorized personnel must verify before dispatch. ${normalizedDetails}`,
  };
}

module.exports = { buildReportPresentation, TEST_MODE_PREFIX };
