type Coordinate = { latitude: number; longitude: number };

type OsrmRoute = {
  distanceKm: number;
  etaMinutes: number;
  routeCoordinates: Coordinate[];
};

export async function fetchRoadRoute(
  from: Coordinate,
  to: Coordinate,
  includeGeometry: boolean,
  minEtaMinutes = 1,
): Promise<OsrmRoute> {
  // Geometry is optional so screens can request lighter responses when paths are not needed.
  const geometryParams = includeGeometry ? 'overview=full&geometries=geojson' : 'overview=false';
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?${geometryParams}&alternatives=false&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM ${response.status}`);
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }>;
  };

  const route = data.routes?.[0];
  if (!route?.distance || !route?.duration) {
    throw new Error('No route');
  }

  const coordinates = route.geometry?.coordinates ?? [];
  return {
    distanceKm: route.distance / 1000,
    // Clamp ETA to avoid 0-minute outputs on very short paths.
    etaMinutes: Math.max(minEtaMinutes, Math.round(route.duration / 60)),
    routeCoordinates: coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}
