import { beginPerformanceStage, endPerformanceStage } from '../utils/performanceDiagnosticsCore.ts';

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
const ROUTING_TIMEOUT_MS = 10_000;
const ROUTING_SELECTION_TIMEOUT_MS = 15_000;

type OsrmWaypoint = {
  distance?: number;
};

function isPracticalRoadSnap(waypoint: OsrmWaypoint | undefined) {
  const distance = Number(waypoint?.distance);
  return Number.isFinite(distance) && distance <= MAX_ROAD_SNAP_DISTANCE_METERS;
}

function isUnreachableRouteError(error: unknown) {
  const message = String((error as { message?: string })?.message || '');
  return message === 'No route' || message === 'Route geometry unavailable';
}

async function fetchRoutingResponse(url: string, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  const timeout = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

export async function fetchRoadRoute(
  from: Coordinate,
  to: Coordinate,
  includeGeometry: boolean,
  minEtaMinutes = 1,
  signal?: AbortSignal,
): Promise<OsrmRoute> {
  // Geometry is optional so screens can request lighter responses when paths are not needed.
  const geometryParams = includeGeometry ? 'overview=full&geometries=geojson' : 'overview=false';
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?${geometryParams}&alternatives=false&steps=false`;

  const requestMarker = beginPerformanceStage('osrm-route-request');
  let response: Response;
  try {
    response = await fetchRoutingResponse(url, signal);
    endPerformanceStage(requestMarker, { success: response.ok });
  } catch (error) {
    endPerformanceStage(requestMarker, { success: false });
    throw error;
  }
  if (!response.ok) {
    throw new Error(`OSRM ${response.status}`);
  }

  const parseMarker = beginPerformanceStage('osrm-route-json-parse');
  const data = (await response.json().finally(() => endPerformanceStage(parseMarker))) as {
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
  signal?: AbortSignal,
): Promise<BestRoadRoute | null> {
  if (destinations.length === 0) {
    return null;
  }

  // Once jurisdiction/capacity filtering leaves a single eligible center,
  // skip the redundant table lookup and request its verified geometry once.
  if (destinations.length === 1) {
    const destination = destinations[0];
    try {
      const route = await fetchRoadRoute(from, destination, true, minEtaMinutes, signal);
      return {
        ...route,
        destinationId: destination.id,
      };
    } catch (error) {
      if (isUnreachableRouteError(error)) return null;
      throw error;
    }
  }

  const coordinates = [from, ...destinations]
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const destinationIndexes = destinations.map((_, index) => index + 1).join(';');
  const url =
    `${OSRM_BASE_URL}/table/v1/driving/${coordinates}` +
    `?sources=0&destinations=${destinationIndexes}&annotations=distance,duration`;

  const requestMarker = beginPerformanceStage('osrm-table-request');
  let response: Response;
  try {
    response = await fetchRoutingResponse(url, signal);
    endPerformanceStage(requestMarker, { success: response.ok, candidateCount: destinations.length });
  } catch (error) {
    endPerformanceStage(requestMarker, { success: false, candidateCount: destinations.length });
    throw error;
  }
  if (!response.ok) {
    throw new Error(`OSRM table ${response.status}`);
  }

  const parseMarker = beginPerformanceStage('osrm-table-json-parse');
  const data = (await response.json().finally(() => endPerformanceStage(parseMarker, {
    candidateCount: destinations.length,
  }))) as {
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

  for (const candidate of reachable) {
    try {
      const route = await fetchRoadRoute(from, candidate.destination, true, minEtaMinutes, signal);
      return {
        ...route,
        destinationId: candidate.destination.id,
      };
    } catch (error) {
      if (!isUnreachableRouteError(error)) throw error;
    }
  }
  return null;
}

/**
 * Selects across every eligible center in one OSRM table operation and bounds
 * the table + geometry sequence with a shared deadline. The former sequential
 * three-center batching multiplied the per-request timeout into minutes.
 */
export async function fetchBestRoadRouteProgressively(
  from: Coordinate,
  orderedDestinations: RoadRouteDestination[],
  _batchSize = 3,
  minEtaMinutes = 1,
  signal?: AbortSignal,
): Promise<BestRoadRoute | null> {
  if (orderedDestinations.length === 0) return null;
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  const timeout = setTimeout(() => controller.abort(), ROUTING_SELECTION_TIMEOUT_MS);
  try {
    return await fetchBestRoadRoute(
      from,
      orderedDestinations,
      minEtaMinutes,
      controller.signal,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromExternalSignal);
  }
}
