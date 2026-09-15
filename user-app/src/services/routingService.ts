type Coordinate = { latitude: number; longitude: number };

type OsrmRoute = {
  distanceKm: number;
  etaMinutes: number;
  routeCoordinates: Coordinate[];
};

export type RoadRouteDestination = Coordinate & { id: string };

export type BestRoadRoute = OsrmRoute & {
  destinationId: string;
};

const OSRM_BASE_URL = 'https://router.project-osrm.org';
const MAX_ROAD_SNAP_DISTANCE_METERS = 750;

type OsrmWaypoint = {
  distance?: number;
};

function isPracticalRoadSnap(waypoint: OsrmWaypoint | undefined) {
  const distance = Number(waypoint?.distance);
  return Number.isFinite(distance) && distance <= MAX_ROAD_SNAP_DISTANCE_METERS;
}

export async function fetchRoadRoute(
  from: Coordinate,
  to: Coordinate,
  includeGeometry: boolean,
  minEtaMinutes = 1,
): Promise<OsrmRoute> {
  // Geometry is optional so screens can request lighter responses when paths are not needed.
  const geometryParams = includeGeometry ? 'overview=full&geometries=geojson' : 'overview=false';
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?${geometryParams}&alternatives=false&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM ${response.status}`);
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }>;
    waypoints?: OsrmWaypoint[];
  };

  const route = data.routes?.[0];
  if (
    !route ||
    !Number.isFinite(Number(route.distance)) ||
    !Number.isFinite(Number(route.duration)) ||
    !isPracticalRoadSnap(data.waypoints?.[0]) ||
    !isPracticalRoadSnap(data.waypoints?.[1])
  ) {
    throw new Error('No route');
  }

  const coordinates = route.geometry?.coordinates ?? [];
  if (includeGeometry && coordinates.length < 2) {
    throw new Error('Route geometry unavailable');
  }
  return {
    distanceKm: Number(route.distance) / 1000,
    // Clamp ETA to avoid 0-minute outputs on very short paths.
    etaMinutes: Math.max(minEtaMinutes, Math.round(Number(route.duration) / 60)),
    routeCoordinates: coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}

export async function fetchBestRoadRoute(
  from: Coordinate,
  destinations: RoadRouteDestination[],
  minEtaMinutes = 1,
): Promise<BestRoadRoute | null> {
  if (destinations.length === 0) {
    return null;
  }

  const coordinates = [from, ...destinations]
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const destinationIndexes = destinations.map((_, index) => index + 1).join(';');
  const url =
    `${OSRM_BASE_URL}/table/v1/driving/${coordinates}` +
    `?sources=0&destinations=${destinationIndexes}&annotations=distance,duration`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM table ${response.status}`);
  }

  const data = (await response.json()) as {
    code?: string;
    distances?: Array<Array<number | null>>;
    durations?: Array<Array<number | null>>;
    sources?: OsrmWaypoint[];
    destinations?: OsrmWaypoint[];
  };

  if (data.code !== 'Ok' || !isPracticalRoadSnap(data.sources?.[0])) {
    return null;
  }

  const roadDistances = data.distances?.[0] || [];
  const roadDurations = data.durations?.[0] || [];
  const reachable = destinations
    .map((destination, index) => {
      const rawDistance = roadDistances[index];
      const rawDuration = roadDurations[index];
      return {
        destination,
        distanceMeters: rawDistance === null || rawDistance === undefined ? Number.NaN : Number(rawDistance),
        durationSeconds: rawDuration === null || rawDuration === undefined ? Number.NaN : Number(rawDuration),
        waypoint: data.destinations?.[index],
      };
    })
    .filter(
      (candidate) =>
        Number.isFinite(candidate.distanceMeters) &&
        candidate.distanceMeters >= 0 &&
        Number.isFinite(candidate.durationSeconds) &&
        candidate.durationSeconds >= 0 &&
        isPracticalRoadSnap(candidate.waypoint),
    )
    .sort(
      (first, second) =>
        first.distanceMeters - second.distanceMeters ||
        first.durationSeconds - second.durationSeconds,
    );

  const best = reachable[0];
  if (!best) {
    return null;
  }

  const route = await fetchRoadRoute(from, best.destination, true, minEtaMinutes);
  if (route.routeCoordinates.length < 2) {
    return null;
  }

  return {
    ...route,
    destinationId: best.destination.id,
  };
}
