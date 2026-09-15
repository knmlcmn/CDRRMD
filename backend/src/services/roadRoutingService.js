const OSRM_BASE_URL = 'https://router.project-osrm.org';
const MAX_ROAD_SNAP_DISTANCE_METERS = 750;

function hasPracticalRoadSnap(waypoint) {
  const distance = Number(waypoint?.distance);
  return Number.isFinite(distance) && distance <= MAX_ROAD_SNAP_DISTANCE_METERS;
}

async function findShortestReachableDestination(origin, destinations) {
  if (!Number.isFinite(origin?.latitude) || !Number.isFinite(origin?.longitude) || destinations.length === 0) {
    return null;
  }

  const points = [origin, ...destinations]
    .map((point) => `${Number(point.longitude)},${Number(point.latitude)}`)
    .join(';');
  const destinationIndexes = destinations.map((_, index) => index + 1).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `${OSRM_BASE_URL}/table/v1/driving/${points}` +
        `?sources=0&destinations=${destinationIndexes}&annotations=distance,duration`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`OSRM table ${response.status}`);
    }

    const data = await response.json();
    if (data?.code !== 'Ok' || !hasPracticalRoadSnap(data.sources?.[0])) {
      return null;
    }

    const distances = data.distances?.[0] || [];
    const durations = data.durations?.[0] || [];
    return destinations
      .map((destination, index) => {
        const rawDistance = distances[index];
        const rawDuration = durations[index];
        return {
          destination,
          distanceMeters: rawDistance == null ? Number.NaN : Number(rawDistance),
          durationSeconds: rawDuration == null ? Number.NaN : Number(rawDuration),
          waypoint: data.destinations?.[index],
        };
      })
      .filter(
        (candidate) =>
          Number.isFinite(candidate.distanceMeters) &&
          candidate.distanceMeters >= 0 &&
          Number.isFinite(candidate.durationSeconds) &&
          candidate.durationSeconds >= 0 &&
          hasPracticalRoadSnap(candidate.waypoint),
      )
      .sort(
        (first, second) =>
          first.distanceMeters - second.distanceMeters ||
          first.durationSeconds - second.durationSeconds,
      )[0] || null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { findShortestReachableDestination };
