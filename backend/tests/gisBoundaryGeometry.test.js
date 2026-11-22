const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  coordinateKey,
  polygonizeBoundaryFeatureCollection,
  polygonizeBoundaryGeometry,
  ringHasSelfIntersection,
  segmentsIntersect,
  signedRingArea,
} = require('../src/services/gisBoundaryGeometry');

const sourcePath = path.join(__dirname, '..', 'src', 'data', 'calamba_barangay_boundaries_osm.geojson');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const expectedBarangays = ['lingga', 'looc', 'palingon', 'parian', 'sampiruhan', 'uwisan'];

function geometryRings(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  return geometry.coordinates.flatMap((polygon) => polygon);
}

function sourceCoordinateKeys(geometry) {
  const keys = new Set();
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      keys.add(coordinateKey(value));
      return;
    }
    value.forEach(visit);
  };
  visit(geometry.coordinates);
  return keys;
}

function isSharedEndpoint(firstStart, firstEnd, secondStart, secondEnd) {
  const first = new Set([coordinateKey(firstStart), coordinateKey(firstEnd)]);
  return first.has(coordinateKey(secondStart)) || first.has(coordinateKey(secondEnd));
}

function pointStrictlyInsideRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const prior = ring[previous];
    const cross = (point[1] - prior[1]) * (current[0] - prior[0]) -
      (point[0] - prior[0]) * (current[1] - prior[1]);
    const onSegment = Math.abs(cross) <= 1e-12 &&
      point[0] >= Math.min(prior[0], current[0]) - 1e-12 && point[0] <= Math.max(prior[0], current[0]) + 1e-12 &&
      point[1] >= Math.min(prior[1], current[1]) - 1e-12 && point[1] <= Math.max(prior[1], current[1]) + 1e-12;
    if (onSegment) return false;
    if (
      current[1] > point[1] !== prior[1] > point[1] &&
      point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]
    ) inside = !inside;
  }
  return inside;
}

test('all six OSM segment sets reconstruct to closed non-self-intersecting polygons without synthetic coordinates', () => {
  const result = polygonizeBoundaryFeatureCollection(source);
  assert.deepEqual(
    result.features.map((feature) => String(feature.properties.barangay_name).toLowerCase()).sort(),
    expectedBarangays,
  );

  result.features.forEach((feature, index) => {
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
    const originalKeys = sourceCoordinateKeys(source.features[index].geometry);
    geometryRings(feature.geometry).forEach((ring) => {
      assert.equal(coordinateKey(ring[0]), coordinateKey(ring[ring.length - 1]));
      assert.ok(Math.abs(signedRingArea(ring)) > 0);
      assert.equal(ringHasSelfIntersection(ring), false);
      ring.forEach((coordinate) => assert.ok(originalKeys.has(coordinateKey(coordinate))));
    });
  });
});

test('the six reconstructed barangay polygons have no improper boundary crossings', () => {
  const result = polygonizeBoundaryFeatureCollection(source);
  for (let firstFeature = 0; firstFeature < result.features.length; firstFeature += 1) {
    for (let secondFeature = firstFeature + 1; secondFeature < result.features.length; secondFeature += 1) {
      const firstRings = geometryRings(result.features[firstFeature].geometry);
      const secondRings = geometryRings(result.features[secondFeature].geometry);
      firstRings.forEach((firstRing) => secondRings.forEach((secondRing) => {
        for (let first = 0; first < firstRing.length - 1; first += 1) {
          for (let second = 0; second < secondRing.length - 1; second += 1) {
            if (!segmentsIntersect(firstRing[first], firstRing[first + 1], secondRing[second], secondRing[second + 1])) continue;
            assert.equal(
              isSharedEndpoint(firstRing[first], firstRing[first + 1], secondRing[second], secondRing[second + 1]),
              true,
              `${result.features[firstFeature].properties.barangay_name} improperly crosses ${result.features[secondFeature].properties.barangay_name}`,
            );
          }
        }
      }));
    }
  }
});

test('no reconstructed barangay vertex lies inside another supported barangay', () => {
  const result = polygonizeBoundaryFeatureCollection(source);
  result.features.forEach((feature, featureIndex) => {
    result.features.forEach((otherFeature, otherIndex) => {
      if (featureIndex === otherIndex) return;
      geometryRings(feature.geometry).forEach((ring) => ring.slice(0, -1).forEach((point) => {
        geometryRings(otherFeature.geometry).forEach((otherRing) => assert.equal(
          pointStrictlyInsideRing(point, otherRing),
          false,
          `${feature.properties.barangay_name} overlaps ${otherFeature.properties.barangay_name}`,
        ));
      }));
    });
  });
});

test('invalid open linework fails closed instead of using a convex hull or invented closing edge', () => {
  assert.throws(
    () => polygonizeBoundaryGeometry({
      type: 'MultiLineString',
      coordinates: [[[121.1, 14.1], [121.2, 14.1], [121.2, 14.2]]],
    }, 'Invalid test boundary'),
    /cannot be reconstructed into closed rings/,
  );
});
