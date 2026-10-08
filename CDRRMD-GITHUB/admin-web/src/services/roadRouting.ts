export type RoadCoordinate = { latitude: number; longitude: number };

export type RoadRoute = {
  coordinates: RoadCoordinate[];
  distanceKm: number;
  etaMinutes: number;
};

const OSRM_BASE_URL = 'https://router.project-osrm.org';

export async function fetchRoadRoute(from: RoadCoordinate, to: RoadCoordinate): Promise<RoadRoute> {
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?overview=full&geometries=geojson&alternatives=true&steps=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OSRM ${response.status}`);

  const data = await response.json() as {
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }>;
  };
  const route = data.routes
    ?.filter((candidate) => Number.isFinite(candidate.distance) && Number.isFinite(candidate.duration)
      && candidate.geometry?.coordinates?.length)
    .sort((left, right) => Number(left.distance) - Number(right.distance))[0];
  if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)
    || !route.geometry?.coordinates?.length) {
    throw new Error('No road route found.');
  }

  return {
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceKm: Number(route.distance) / 1000,
    etaMinutes: Math.max(1, Math.round(Number(route.duration) / 60)),
  };
}
