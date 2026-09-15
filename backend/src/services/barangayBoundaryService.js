const fs = require('fs');
const path = require('path');

const BOUNDARY_PATH = path.join(__dirname, '..', 'data', 'calamba_barangay_boundaries_osm.geojson');

let cachedMtimeMs = -1;
let cachedBoundaries = [];

function normalizeBarangayName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^(brgy\.?|barangay)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function coordinateKey(coordinate) {
  return `${Number(coordinate?.[0]).toFixed(7)},${Number(coordinate?.[1]).toFixed(7)}`;
}

function joinSegmentsToRings(segments) {
  const remaining = (Array.isArray(segments) ? segments : [])
    .filter((segment) => Array.isArray(segment) && segment.length > 1)
    .map((segment) => segment.map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])]));
  const rings = [];

  while (remaining.length > 0) {
    const ring = remaining.shift();
    let joined = true;

    while (joined && remaining.length > 0) {
      joined = false;
      const ringStart = coordinateKey(ring[0]);
      const ringEnd = coordinateKey(ring[ring.length - 1]);

      for (let index = 0; index < remaining.length; index += 1) {
        let segment = remaining[index];
        const segmentStart = coordinateKey(segment[0]);
        const segmentEnd = coordinateKey(segment[segment.length - 1]);

        if (ringEnd === segmentStart) {
          ring.push(...segment.slice(1));
        } else if (ringEnd === segmentEnd) {
          segment = segment.slice().reverse();
          ring.push(...segment.slice(1));
        } else if (ringStart === segmentEnd) {
          ring.unshift(...segment.slice(0, -1));
        } else if (ringStart === segmentStart) {
          segment = segment.slice().reverse();
          ring.unshift(...segment.slice(0, -1));
        } else {
          continue;
        }

        remaining.splice(index, 1);
        joined = true;
        break;
      }
    }

    if (ring.length >= 4 && coordinateKey(ring[0]) === coordinateKey(ring[ring.length - 1])) {
      rings.push(ring);
    }
  }

  return rings;
}

function geometryToPolygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  if (geometry?.type === 'LineString') return joinSegmentsToRings([geometry.coordinates]).map((ring) => [ring]);
  if (geometry?.type === 'MultiLineString') return joinSegmentsToRings(geometry.coordinates).map((ring) => [ring]);
  return [];
}

function pointOnSegment(x, y, first, second) {
  const [x1, y1] = first;
  const [x2, y2] = second;
  const length = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (length < Number.EPSILON) return Math.abs(x - x1) < 1e-10 && Math.abs(y - y1) < 1e-10;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  return dot >= 0 && dot <= length;
}

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(longitude, latitude, currentPoint, previousPoint)) return true;
    const [currentLon, currentLat] = currentPoint;
    const [previousLon, previousLat] = previousPoint;
    if (
      currentLat > latitude !== previousLat > latitude &&
      longitude < ((previousLon - currentLon) * (latitude - currentLat)) / (previousLat - currentLat) + currentLon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(longitude, latitude, polygon) {
  if (!Array.isArray(polygon?.[0]) || !pointInRing(longitude, latitude, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));
}

function loadBoundaries() {
  const mtimeMs = fs.statSync(BOUNDARY_PATH).mtimeMs;
  if (mtimeMs === cachedMtimeMs && cachedBoundaries.length > 0) return cachedBoundaries;

  const parsed = JSON.parse(fs.readFileSync(BOUNDARY_PATH, 'utf8'));
  cachedBoundaries = (Array.isArray(parsed?.features) ? parsed.features : [])
    .map((feature) => ({
      name: String(feature?.properties?.barangay_name || '').trim(),
      polygons: geometryToPolygons(feature?.geometry),
    }))
    .filter((boundary) => boundary.name && boundary.polygons.length > 0);
  cachedMtimeMs = mtimeMs;
  return cachedBoundaries;
}

function resolveBarangayAtLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const boundary = loadBoundaries().find((item) =>
    item.polygons.some((polygon) => pointInPolygon(lon, lat, polygon)),
  );
  return boundary?.name || null;
}

function isLocationInsideBarangay(latitude, longitude, barangayName) {
  const resolved = resolveBarangayAtLocation(latitude, longitude);
  return Boolean(resolved && normalizeBarangayName(resolved) === normalizeBarangayName(barangayName));
}

function pointToSegmentDistanceKm(longitude, latitude, first, second) {
  const latitudeScale = 111.32;
  const longitudeScale = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const ax = (Number(first[0]) - longitude) * longitudeScale;
  const ay = (Number(first[1]) - latitude) * latitudeScale;
  const bx = (Number(second[0]) - longitude) * longitudeScale;
  const by = (Number(second[1]) - latitude) * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const projection = denominator > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator)) : 0;
  return Math.hypot(ax + projection * dx, ay + projection * dy);
}

function distanceToBoundaryKm(latitude, longitude, boundary) {
  if (boundary.polygons.some((polygon) => pointInPolygon(longitude, latitude, polygon))) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  boundary.polygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      for (let index = 1; index < ring.length; index += 1) {
        nearest = Math.min(
          nearest,
          pointToSegmentDistanceKm(longitude, latitude, ring[index - 1], ring[index]),
        );
      }
    });
  });
  return nearest;
}

function resolveNearbyBarangayAtLocation(latitude, longitude, supportedNames, maxDistanceKm = 2.5) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const supported = new Set((supportedNames || []).map(normalizeBarangayName));
  const candidates = loadBoundaries()
    .filter((boundary) => supported.size === 0 || supported.has(normalizeBarangayName(boundary.name)))
    .map((boundary) => ({
      name: boundary.name,
      distanceKm: distanceToBoundaryKm(lat, lon, boundary),
    }))
    .sort((first, second) => first.distanceKm - second.distanceKm);
  const nearest = candidates[0];
  return nearest && nearest.distanceKm <= maxDistanceKm ? nearest : null;
}

module.exports = {
  isLocationInsideBarangay,
  normalizeBarangayName,
  resolveNearbyBarangayAtLocation,
  resolveBarangayAtLocation,
};
