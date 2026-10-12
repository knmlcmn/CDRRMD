export type RoadCoordinate = { latitude: number; longitude: number };

export type RoadRoute = {
  coordinates: RoadCoordinate[];
  distanceKm: number;
  etaMinutes: number;
};

const OSRM_BASE_URL = 'https://router.project-osrm.org';
const ROUTE_CACHE_TTL_MS = 30_000;
const routeCache = new Map<string, { expiresAt: number; route: RoadRoute }>();
const pendingRoutes = new Map<string, Promise<RoadRoute>>();

function routeKey(from: RoadCoordinate, to: RoadCoordinate) {
  // Roughly 11 m precision avoids repeating an identical route request for
  // every tiny GPS fluctuation while a responder is moving.
  return [from.longitude, from.latitude, to.longitude, to.latitude]
    .map((value) => Number(value).toFixed(4))
    .join(',');
}

async function requestRoadRoute(from: RoadCoordinate, to: RoadCoordinate): Promise<RoadRoute> {
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
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

export function fetchRoadRoute(from: RoadCoordinate, to: RoadCoordinate): Promise<RoadRoute> {
  const key = routeKey(from, to);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.route);

  const pending = pendingRoutes.get(key);
  if (pending) return pending;

  const request = requestRoadRoute(from, to)
    .then((route) => {
      routeCache.set(key, { route, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
      if (routeCache.size > 40) routeCache.delete(routeCache.keys().next().value as string);
      return route;
    })
    .finally(() => pendingRoutes.delete(key));
  pendingRoutes.set(key, request);
  return request;
}
