const ENDPOINT_PRECISION = 7;
const EPSILON = 1e-12;

function coordinateKey(coordinate) {
  return `${Number(coordinate?.[0]).toFixed(ENDPOINT_PRECISION)},${Number(coordinate?.[1]).toFixed(ENDPOINT_PRECISION)}`;
}

function normalizeLine(line) {
  return (Array.isArray(line) ? line : [])
    .map((coordinate) => [Number(coordinate?.[0]), Number(coordinate?.[1])])
    .filter(([longitude, latitude]) =>
      Number.isFinite(longitude) && Number.isFinite(latitude) &&
      longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90,
    );
}

function joinSegmentsToClosedRings(sourceSegments) {
  const remaining = (Array.isArray(sourceSegments) ? sourceSegments : [])
    .map(normalizeLine)
    .filter((line) => line.length > 1);
  const rings = [];
  const unclosed = [];

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
    } else {
      unclosed.push(ring);
    }
  }

  return { rings, unclosed };
}

function signedRingArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    twiceArea += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return twiceArea / 2;
}

function orientation(first, second, third) {
  const cross = (second[0] - first[0]) * (third[1] - first[1]) -
    (second[1] - first[1]) * (third[0] - first[0]);
  if (Math.abs(cross) <= EPSILON) return 0;
  return cross > 0 ? 1 : -1;
}

function pointOnSegment(first, second, point) {
  return point[0] >= Math.min(first[0], second[0]) - EPSILON &&
    point[0] <= Math.max(first[0], second[0]) + EPSILON &&
    point[1] >= Math.min(first[1], second[1]) - EPSILON &&
    point[1] <= Math.max(first[1], second[1]) + EPSILON;
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) return true;
  if (firstOrientation === 0 && pointOnSegment(firstStart, firstEnd, secondStart)) return true;
  if (secondOrientation === 0 && pointOnSegment(firstStart, firstEnd, secondEnd)) return true;
  if (thirdOrientation === 0 && pointOnSegment(secondStart, secondEnd, firstStart)) return true;
  return fourthOrientation === 0 && pointOnSegment(secondStart, secondEnd, firstEnd);
}

function ringHasSelfIntersection(ring) {
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const adjacent = Math.abs(first - second) <= 1 || (first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (segmentsIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) return true;
    }
  }
  return false;
}

function assertValidRing(ring, label) {
  if (!Array.isArray(ring) || ring.length < 4) throw new Error(`${label} has fewer than four coordinates.`);
  if (coordinateKey(ring[0]) !== coordinateKey(ring[ring.length - 1])) throw new Error(`${label} is not closed.`);
  if (Math.abs(signedRingArea(ring)) <= EPSILON) throw new Error(`${label} has zero area.`);
  if (ringHasSelfIntersection(ring)) throw new Error(`${label} self-intersects.`);
}

function validatePolygonCoordinates(polygons, label) {
  polygons.forEach((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error(`${label} polygon ${polygonIndex + 1} has no rings.`);
    }
    polygon.forEach((ring, ringIndex) => assertValidRing(ring, `${label} ring ${polygonIndex + 1}.${ringIndex + 1}`));
  });
}

function polygonizeBoundaryGeometry(geometry, label = 'Boundary geometry') {
  if (geometry?.type === 'Polygon') {
    validatePolygonCoordinates([geometry.coordinates], label);
    return geometry;
  }
  if (geometry?.type === 'MultiPolygon') {
    validatePolygonCoordinates(geometry.coordinates, label);
    return geometry;
  }

  const segments = geometry?.type === 'LineString'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString'
      ? geometry.coordinates
      : null;
  if (!segments) throw new Error(`${label} uses unsupported geometry type ${geometry?.type || 'unknown'}.`);

  const { rings, unclosed } = joinSegmentsToClosedRings(segments);
  if (unclosed.length > 0 || rings.length === 0) {
    throw new Error(`${label} cannot be reconstructed into closed rings without changing source coordinates.`);
  }
  const polygons = rings.map((ring) => [ring]);
  validatePolygonCoordinates(polygons, label);
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function polygonizeBoundaryFeatureCollection(collection) {
  const features = Array.isArray(collection?.features) ? collection.features : [];
  return {
    ...collection,
    features: features.map((feature, index) => {
      const name = feature?.properties?.barangay_name || feature?.properties?.name || `feature ${index + 1}`;
      return {
        ...feature,
        properties: {
          ...(feature?.properties || {}),
          boundary_geometry: 'validated-polygon-from-source-segments',
        },
        geometry: polygonizeBoundaryGeometry(feature?.geometry, `Boundary for ${name}`),
      };
    }),
  };
}

module.exports = {
  coordinateKey,
  joinSegmentsToClosedRings,
  polygonizeBoundaryFeatureCollection,
  polygonizeBoundaryGeometry,
  ringHasSelfIntersection,
  segmentsIntersect,
  signedRingArea,
};
