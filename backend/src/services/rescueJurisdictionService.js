const {
  resolveBarangayAtLocation,
  resolveNearbyBarangayAtLocation,
} = require('./barangayBoundaryService');
const { SUPPORTED_BARANGAYS, isSupportedBarangay } = require('./supportedBarangays');

function resolveRescueJurisdiction(latitude, longitude, testModeEnabled = false) {
  const containingBarangay = resolveBarangayAtLocation(latitude, longitude);
  if (isSupportedBarangay(containingBarangay)) {
    return {
      handlingBarangay: containingBarangay,
      outsideNormalServiceArea: false,
      selectionMethod: 'containing-polygon',
    };
  }

  if (!testModeEnabled) return null;
  const nearest = resolveNearbyBarangayAtLocation(
    latitude,
    longitude,
    SUPPORTED_BARANGAYS,
    Number.POSITIVE_INFINITY,
  );
  if (!nearest || !isSupportedBarangay(nearest.name)) return null;

  return {
    handlingBarangay: nearest.name,
    outsideNormalServiceArea: true,
    selectionMethod: 'nearest-polygon-boundary',
    distanceToBoundaryKm: Number(nearest.distanceKm),
  };
}

module.exports = { resolveRescueJurisdiction };
