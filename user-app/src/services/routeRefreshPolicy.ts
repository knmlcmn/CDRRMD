export type RoutePoint = { latitude: number; longitude: number };

export const ROUTE_REFRESH_MIN_DISTANCE_METERS = 25;
export const ROUTE_REFRESH_MAX_AGE_MS = 30_000;

function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(from: RoutePoint, to: RoutePoint) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export type PreviousRouteRefresh = {
  key: string;
  location: RoutePoint;
  refreshedAt: number;
};

export function shouldRefreshRoute({
  previous,
  key,
  location,
  now,
  minDistanceMeters = ROUTE_REFRESH_MIN_DISTANCE_METERS,
  maxAgeMs = ROUTE_REFRESH_MAX_AGE_MS,
}: {
  previous: PreviousRouteRefresh | null;
  key: string;
  location: RoutePoint;
  now: number;
  minDistanceMeters?: number;
  maxAgeMs?: number;
}) {
  if (!previous || previous.key !== key) return true;
  if (now - previous.refreshedAt >= maxAgeMs) return true;
  return distanceMeters(previous.location, location) >= minDistanceMeters;
}
