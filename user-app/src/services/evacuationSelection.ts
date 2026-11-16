export type EvacuationCandidate = {
  id: string;
  barangay: string;
  latitude: number;
  longitude: number;
  capacity: number;
  evacuees: number;
  status: 'available' | 'full';
};

export type RankedEvacuationCandidate<T extends EvacuationCandidate> = {
  area: T;
  straightLineDistanceMeters: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function normalizeBarangayName(value: unknown) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/^(barangay|brgy\.?)\s+/i, '')
    .replace(/\s+/g, ' ');
}

export function geographicDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const radians = Math.PI / 180;
  const firstLatitude = from.latitude * radians;
  const secondLatitude = to.latitude * radians;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const haversine = sinLatitude * sinLatitude
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * sinLongitude * sinLongitude;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function rankNearestEligibleEvacuationCenters<T extends EvacuationCandidate>(
  origin: { latitude: number; longitude: number },
  areas: readonly T[],
  peopleCount: number,
  shortlistSize = 3,
  barangayName?: string,
): RankedEvacuationCandidate<T>[] {
  const barangayKey = normalizeBarangayName(barangayName);
  const requiredSlots = Math.max(1, Math.floor(Number(peopleCount) || 1));
  const limit = Math.max(1, Math.floor(shortlistSize));
  if (!Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)) return [];

  return areas
    .filter((area) => (
      (!barangayKey || normalizeBarangayName(area.barangay) === barangayKey)
      && area.status !== 'full'
      && Number.isFinite(area.latitude)
      && Number.isFinite(area.longitude)
      && area.latitude >= -90
      && area.latitude <= 90
      && area.longitude >= -180
      && area.longitude <= 180
      && Number.isFinite(area.capacity)
      && Number.isFinite(area.evacuees)
      && area.capacity - area.evacuees >= requiredSlots
    ))
    .map((area) => ({ area, straightLineDistanceMeters: geographicDistanceMeters(origin, area) }))
    .sort((first, second) => first.straightLineDistanceMeters - second.straightLineDistanceMeters
      || String(first.area.id).localeCompare(String(second.area.id)))
    .slice(0, limit);
}
