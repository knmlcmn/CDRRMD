const fs = require('fs');
const path = require('path');

const CALAMBA_CENTER = {
  latitude: 14.206021,
  longitude: 121.1556496,
};

const BARANGAY_BOUNDARY_PATH = path.join(__dirname, '..', 'data', 'calamba_barangay_flood_susceptibility.geojson');
const BARANGAY_BOUNDARY_OUTLINE_CACHE_PATH = path.join(__dirname, '..', 'data', 'calamba_barangay_boundaries_osm.geojson');
const BARANGAY_BOUNDARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
let cachedBarangayRiskGeoJson = null;
let cachedBarangayBoundaryOutlines = null;
let cachedBarangayBoundaryOutlinesAt = 0;

const CALAMBA_BOUNDS = {
  latMin: 14.137703,
  latMax: 14.2662133,
  lonMin: 121.0218057,
  lonMax: 121.2214277,
};

const CALAMBA_BOUNDARY_RING = [
  [121.0218057, 14.137703],
  [121.0702, 14.2531],
  [121.1434, 14.2662133],
  [121.2214277, 14.2498],
  [121.2098, 14.1712],
  [121.1784, 14.1425],
  [121.0896, 14.1397],
  [121.0218057, 14.137703],
];

const RASTER_CELL_STEP = 0.0032;
const RAIN_IMPACT_CACHE_TTL_MS = 10 * 1000;
const BARANGAY_TEMPERATURE_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRainImpactPayload = null;
let cachedRainImpactAt = 0;
const cachedBarangayTemperatureByKey = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRainBand(totalRainMm) {
  if (totalRainMm >= 18) {
    return 'extreme';
  }
  if (totalRainMm >= 10) {
    return 'heavy';
  }
  if (totalRainMm >= 4) {
    return 'moderate';
  }
  return 'low';
}

function toRainLevel(rainMmPerHour) {
  if (rainMmPerHour >= 18) {
    return 'Severe';
  }
  if (rainMmPerHour >= 10) {
    return 'Heavy';
  }
  if (rainMmPerHour >= 4) {
    return 'Moderate';
  }
  return 'Light';
}

function rainLevelColor(level) {
  if (level === 'Severe') {
    return '#7f1d1d';
  }
  if (level === 'Heavy') {
    return '#dc2626';
  }
  if (level === 'Moderate') {
    return '#f97316';
  }
  return '#16a34a';
}

function toStormRiskLabel(probabilityPct) {
  if (probabilityPct >= 75) {
    return 'Very High';
  }
  if (probabilityPct >= 50) {
    return 'High';
  }
  if (probabilityPct >= 25) {
    return 'Moderate';
  }
  return 'Low';
}

function toTyphoonImpactLabel(cityImpactLevel, rainMmPerHour, thunderstormProbabilityPct) {
  if (cityImpactLevel === 'High' || rainMmPerHour >= 14 || thunderstormProbabilityPct >= 75) {
    return 'High';
  }
  if (cityImpactLevel === 'Moderate' || rainMmPerHour >= 6 || thunderstormProbabilityPct >= 45) {
    return 'Moderate';
  }
  return 'Low';
}

function rainfallScore(rainBand) {
  if (rainBand === 'extreme') {
    return 0.85;
  }
  if (rainBand === 'heavy') {
    return 0.5;
  }
  if (rainBand === 'moderate') {
    return 0.25;
  }
  return 0;
}

function riskColor(riskLevel) {
  if (riskLevel === 'HIGH') {
    return '#dc2626';
  }
  if (riskLevel === 'MEDIUM') {
    return '#f97316';
  }
  return '#16a34a';
}

function recommendationByRisk(riskLevel) {
  if (riskLevel === 'HIGH') {
    return 'Evacuate immediately';
  }
  if (riskLevel === 'MEDIUM') {
    return 'Prepare resources';
  }
  return 'Monitor conditions';
}

function gaussian2D(lat, lon, centerLat, centerLon, sigmaLat, sigmaLon) {
  const dLat = (lat - centerLat) / sigmaLat;
  const dLon = (lon - centerLon) / sigmaLon;
  return Math.exp(-0.5 * (dLat * dLat + dLon * dLon));
}

function classifyRisk(score) {
  if (score >= 2.55) {
    return 'HIGH';
  }
  if (score >= 1.85) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function getCachedBarangayBoundaries() {
  if (cachedBarangayRiskGeoJson) {
    return cachedBarangayRiskGeoJson;
  }

  const raw = fs.readFileSync(BARANGAY_BOUNDARY_PATH, 'utf8');
  cachedBarangayRiskGeoJson = JSON.parse(raw);
  return cachedBarangayRiskGeoJson;
}

function loadPersistedBoundaryOutlines() {
  try {
    if (!fs.existsSync(BARANGAY_BOUNDARY_OUTLINE_CACHE_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(BARANGAY_BOUNDARY_OUTLINE_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.features) || parsed.features.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistBoundaryOutlines(payload) {
  try {
    fs.writeFileSync(BARANGAY_BOUNDARY_OUTLINE_CACHE_PATH, JSON.stringify(payload));
  } catch {
    // Cache persistence is best-effort only.
  }
}

function buildRiskLookupByBarangayName() {
  const source = getCachedBarangayBoundaries();
  const lookup = new Map();

  const features = Array.isArray(source?.features) ? source.features : [];
  features.forEach((feature) => {
    const props = feature?.properties || {};
    const name = canonicalBarangayKey(props.barangay_name);
    if (!name) {
      return;
    }

    const normalizedRisk = String(props.flood_risk_level || 'LOW').trim().toUpperCase();
    lookup.set(name, normalizedRisk === 'HIGH' ? 'HIGH' : normalizedRisk === 'MODERATE' ? 'MEDIUM' : normalizedRisk === 'MEDIUM' ? 'MEDIUM' : 'LOW');
  });

  return lookup;
}

function mergeMissingBarangayFeatures(sourceGeoJson) {
  const sourceFeatures = Array.isArray(sourceGeoJson?.features) ? sourceGeoJson.features : [];
  const riskSource = getCachedBarangayBoundaries();
  const riskFeatures = Array.isArray(riskSource?.features) ? riskSource.features : [];

  const byCanonical = new Map();
  sourceFeatures.forEach((feature) => {
    const key = canonicalBarangayKey(feature?.properties?.barangay_name);
    if (!key || byCanonical.has(key)) {
      return;
    }
    byCanonical.set(key, feature);
  });

  riskFeatures.forEach((feature) => {
    const key = canonicalBarangayKey(feature?.properties?.barangay_name);
    if (!key || byCanonical.has(key)) {
      return;
    }

    const normalizedRisk = String(feature?.properties?.flood_risk_level || 'LOW').trim().toUpperCase();
    byCanonical.set(key, {
      type: 'Feature',
      properties: {
        barangay_name: normalizeDisplayBarangayName(feature?.properties?.barangay_name),
        flood_risk_level: normalizedRisk === 'HIGH' ? 'HIGH' : normalizedRisk === 'MODERATE' ? 'MEDIUM' : normalizedRisk === 'MEDIUM' ? 'MEDIUM' : 'LOW',
        geometry_source: 'fallback-risk-polygon',
      },
      geometry: feature?.geometry || null,
    });
  });

  return {
    type: 'FeatureCollection',
    features: Array.from(byCanonical.values()),
    metadata: {
      source: sourceGeoJson?.metadata?.source || 'OpenStreetMap Overpass administrative relations',
      generatedAt: new Date().toISOString(),
      mergedWithRiskFallback: true,
    },
  };
}

function normalizeBarangayKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalBarangayKey(value) {
  return normalizeBarangayKey(value);
}

function normalizeDisplayBarangayName(value) {
  return String(value || '').trim() || 'Barangay';
}

function extractGeometryCoordinates(geometry) {
  if (!geometry || !geometry.type) {
    return [];
  }

  if (geometry.type === 'LineString') {
    const points = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return points.filter((point) => Array.isArray(point) && point.length >= 2);
  }

  if (geometry.type === 'MultiLineString') {
    const lines = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return lines.flat().filter((point) => Array.isArray(point) && point.length >= 2);
  }

  if (geometry.type === 'Polygon') {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return rings.flat().filter((point) => Array.isArray(point) && point.length >= 2);
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return polygons.flat(2).filter((point) => Array.isArray(point) && point.length >= 2);
  }

  return [];
}

function centroidFromCoordinates(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  let lonSum = 0;
  let latSum = 0;
  let count = 0;

  points.forEach((point) => {
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }
    lonSum += lon;
    latSum += lat;
    count += 1;
  });

  if (count === 0) {
    return null;
  }

  return {
    latitude: latSum / count,
    longitude: lonSum / count,
  };
}

function pointInRing(lat, lon, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);

    if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) {
      continue;
    }

    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInGeometry(lat, lon, geometry) {
  if (!geometry || !geometry.type) {
    return false;
  }

  if (geometry.type === 'Polygon') {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return rings.some((ring) => Array.isArray(ring) && ring.length >= 4 && pointInRing(lat, lon, ring));
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return polygons.some((polygon) => {
      const rings = Array.isArray(polygon) ? polygon : [];
      return rings.some((ring) => Array.isArray(ring) && ring.length >= 4 && pointInRing(lat, lon, ring));
    });
  }

  return false;
}

function rainfallIntensityAtPoint(baseRainMmPerHour, lat, lon, thunderstormProbabilityPct, typhoonStrength) {
  const eastNorm = clamp((lon - CALAMBA_BOUNDS.lonMin) / (CALAMBA_BOUNDS.lonMax - CALAMBA_BOUNDS.lonMin), 0, 1);
  const southNorm = clamp((CALAMBA_BOUNDS.latMax - lat) / (CALAMBA_BOUNDS.latMax - CALAMBA_BOUNDS.latMin), 0, 1);

  const lakeBeltBoost = clamp((eastNorm - 0.64) / 0.36, 0, 1) * 0.7;
  const corridorBoost = gaussian2D(lat, lon, 14.201, 121.161, 0.02, 0.05) * 0.35;
  const typhoonPathBoost = gaussian2D(lat, lon, 14.236, 121.19, 0.042, 0.05) * clamp(typhoonStrength, 0, 1.2);

  const multiplier = 0.72 + (eastNorm * 0.45) + (southNorm * 0.16) + lakeBeltBoost + corridorBoost + typhoonPathBoost;
  const thunderBoost = (clamp(thunderstormProbabilityPct, 0, 100) / 100) * 2.2;

  return Number(Math.max(0, (baseRainMmPerHour * multiplier) + thunderBoost).toFixed(2));
}

function toTyphoonStrength(impactLevel, pathLikelyAffectingCalamba) {
  if (impactLevel === 'High') {
    return pathLikelyAffectingCalamba ? 1.15 : 0.9;
  }
  if (impactLevel === 'Moderate') {
    return pathLikelyAffectingCalamba ? 0.8 : 0.55;
  }
  return pathLikelyAffectingCalamba ? 0.45 : 0.2;
}

function extractSamplePointsFromGeometry(geometry) {
  const points = extractGeometryCoordinates(geometry);
  const centroid = centroidFromCoordinates(points);
  if (!centroid) {
    return [];
  }

  const candidates = [
    centroid,
    { latitude: centroid.latitude + 0.004, longitude: centroid.longitude },
    { latitude: centroid.latitude - 0.004, longitude: centroid.longitude },
    { latitude: centroid.latitude, longitude: centroid.longitude + 0.004 },
    { latitude: centroid.latitude, longitude: centroid.longitude - 0.004 },
  ];

  const sampled = candidates.filter((point) =>
    isPointInGeometry(point.latitude, point.longitude, geometry),
  );

  return sampled.length > 0 ? sampled : [centroid];
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function buildConvexHull(points) {
  const normalized = points
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const unique = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const point = normalized[i];
    const prev = unique[unique.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) {
      unique.push(point);
    }
  }

  if (unique.length < 3) {
    return [];
  }

  const lower = [];
  for (let i = 0; i < unique.length; i += 1) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], unique[i]) <= 0) {
      lower.pop();
    }
    lower.push(unique[i]);
  }

  const upper = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], unique[i]) <= 0) {
      upper.pop();
    }
    upper.push(unique[i]);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) {
    return [];
  }

  hull.push(hull[0]);
  return hull;
}

function toPolygonGeometry(geometry) {
  if (!geometry || !geometry.type) {
    return null;
  }

  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    return geometry;
  }

  const points = extractGeometryCoordinates(geometry);
  const hull = buildConvexHull(points);
  if (hull.length < 4) {
    return null;
  }

  return {
    type: 'Polygon',
    coordinates: [hull],
  };
}

function inferTerrainBandAt(lat, lon) {
  if (lon <= 121.10 && lat <= 14.22) {
    return 'upland';
  }
  if (lon >= 121.16) {
    return 'lowland';
  }
  return 'midland';
}

function adjustedTemperatureCelsius(baseTemperature, lat, lon) {
  const terrainBand = inferTerrainBandAt(lat, lon);
  if (terrainBand === 'upland') {
    return Number((baseTemperature - 0.9).toFixed(2));
  }
  if (terrainBand === 'lowland') {
    return Number((baseTemperature + 0.4).toFixed(2));
  }
  return Number(baseTemperature.toFixed(2));
}

async function fetchTemperatureAtPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Invalid coordinate for temperature fetch');
  }

  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    `latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m&hourly=temperature_2m&forecast_days=1&timezone=auto';

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Temperature fetch failed: ${response.status}`);
  }

  const payload = await response.json();
  const currentTemperature = Number(payload?.current?.temperature_2m);
  if (Number.isFinite(currentTemperature)) {
    return Number(currentTemperature.toFixed(2));
  }

  const series = Array.isArray(payload?.hourly?.temperature_2m) ? payload.hourly.temperature_2m : [];
  const firstReading = Number(series[0]);
  if (!Number.isFinite(firstReading)) {
    throw new Error('No hourly temperature values from Open-Meteo');
  }

  return Number(firstReading.toFixed(2));
}

async function fetchBarangayTemperatureLookup(features, fallbackTemperatureCelsius) {
  const lookup = new Map();
  const now = Date.now();

  const jobs = [];
  (Array.isArray(features) ? features : []).forEach((feature) => {
    const nameKey = canonicalBarangayKey(feature?.properties?.barangay_name);
    if (!nameKey || lookup.has(nameKey)) {
      return;
    }

    const centroid = centroidFromCoordinates(extractGeometryCoordinates(feature?.geometry)) || CALAMBA_CENTER;
    const cached = cachedBarangayTemperatureByKey.get(nameKey);
    if (cached && now - cached.updatedAt <= BARANGAY_TEMPERATURE_CACHE_TTL_MS) {
      lookup.set(nameKey, Number(cached.value));
      return;
    }

    jobs.push({
      key: nameKey,
      latitude: Number(centroid.latitude),
      longitude: Number(centroid.longitude),
    });
  });

  const maxConcurrent = 6;
  for (let index = 0; index < jobs.length; index += maxConcurrent) {
    const chunk = jobs.slice(index, index + maxConcurrent);
    const settled = await Promise.allSettled(
      chunk.map((job) => fetchTemperatureAtPoint(job.latitude, job.longitude)),
    );

    settled.forEach((result, offset) => {
      const job = chunk[offset];
      if (!job) {
        return;
      }

      const fallback = adjustedTemperatureCelsius(
        Number(fallbackTemperatureCelsius || 30),
        job.latitude,
        job.longitude,
      );

      const value = result.status === 'fulfilled' && Number.isFinite(Number(result.value))
        ? Number(result.value)
        : fallback;

      lookup.set(job.key, Number(value));
      cachedBarangayTemperatureByKey.set(job.key, {
        value: Number(value),
        updatedAt: now,
      });
    });
  }

  return lookup;
}

async function getCalambaBoundaryOutlinesForOverlay() {
  if (!cachedBarangayBoundaryOutlines) {
    const persisted = loadPersistedBoundaryOutlines();
    if (persisted) {
      cachedBarangayBoundaryOutlines = mergeMissingBarangayFeatures(persisted);
      cachedBarangayBoundaryOutlinesAt = Date.now();
    }
  }

  const now = Date.now();
  if (cachedBarangayBoundaryOutlines && now - cachedBarangayBoundaryOutlinesAt < BARANGAY_BOUNDARY_CACHE_TTL_MS) {
    return cachedBarangayBoundaryOutlines;
  }

  try {
    const next = await buildCalambaBarangayBoundaryGeoJson();
    if (Array.isArray(next?.features) && next.features.length > 0) {
      const merged = mergeMissingBarangayFeatures(next);
      cachedBarangayBoundaryOutlines = merged;
      cachedBarangayBoundaryOutlinesAt = now;
      persistBoundaryOutlines(merged);
      return merged;
    }
  } catch {
    // Ignore and fallback to cached risk polygons.
  }

  return mergeMissingBarangayFeatures(getCachedBarangayBoundaries());
}

function isPointInsideCalambaBoundary(lat, lon) {
  const x = Number(lon);
  const y = Number(lat);
  let inside = false;

  for (let i = 0, j = CALAMBA_BOUNDARY_RING.length - 1; i < CALAMBA_BOUNDARY_RING.length; j = i++) {
    const xi = Number(CALAMBA_BOUNDARY_RING[i][0]);
    const yi = Number(CALAMBA_BOUNDARY_RING[i][1]);
    const xj = Number(CALAMBA_BOUNDARY_RING[j][0]);
    const yj = Number(CALAMBA_BOUNDARY_RING[j][1]);

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

async function fetchOverpassBarangayRelations() {
  const query =
    '[out:json][timeout:45];' +
    '(' +
      'relation["boundary"="administrative"]["admin_level"="10"](14.137703,121.0218057,14.2662133,121.2214277);' +
    ');' +
    'out geom;';

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i += 1) {
    const endpoint = OVERPASS_ENDPOINTS[i];
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'CDRRMD-FloodMap/1.0 (+https://localhost)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) {
        throw new Error(`Overpass ${response.status}`);
      }

      const payload = await response.json();
      const relations = Array.isArray(payload?.elements) ? payload.elements.filter((item) => item?.type === 'relation') : [];
      if (relations.length > 0) {
        return relations;
      }
    } catch (error) {
      if (i === OVERPASS_ENDPOINTS.length - 1) {
        throw error;
      }
    }
  }

  return [];
}

async function buildCalambaBarangayBoundaryGeoJson() {
  const riskLookup = buildRiskLookupByBarangayName();
  const riskLookupByNormalizedName = new Map();
  for (const [key, value] of riskLookup.entries()) {
    riskLookupByNormalizedName.set(canonicalBarangayKey(key), value);
  }

  const relations = await fetchOverpassBarangayRelations();

  const features = relations
    .map((relation) => {
      const name = String(relation?.tags?.name || '').trim();
      if (!name) {
        return null;
      }

      const normalizedName = canonicalBarangayKey(name);
      const riskLevel = riskLookupByNormalizedName.get(normalizedName);
      if (!riskLevel) {
        return null;
      }

      const bounds = relation?.bounds;
      if (bounds) {
        const centerLat = (Number(bounds.minlat) + Number(bounds.maxlat)) / 2;
        const centerLon = (Number(bounds.minlon) + Number(bounds.maxlon)) / 2;
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon) || !isPointInsideCalambaBoundary(centerLat, centerLon)) {
          return null;
        }
      }

      const outerSegments = Array.isArray(relation?.members)
        ? relation.members
          .filter((member) => member?.type === 'way' && member?.role === 'outer' && Array.isArray(member?.geometry) && member.geometry.length > 1)
          .map((member) => member.geometry
            .map((point) => [Number(point?.lon), Number(point?.lat)])
            .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1])))
          .filter((segment) => segment.length > 1)
        : [];

      if (outerSegments.length === 0) {
        return null;
      }

      return {
        type: 'Feature',
        properties: {
          barangay_name: normalizeDisplayBarangayName(name),
          flood_risk_level: riskLevel,
        },
        geometry: {
          type: 'MultiLineString',
          coordinates: outerSegments,
        },
      };
    })
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      source: 'OpenStreetMap Overpass administrative relations',
      generatedAt: new Date().toISOString(),
    },
  };
}

function baseHazardScore(lat, lon) {
  const eastNorm = clamp((lon - CALAMBA_BOUNDS.lonMin) / (CALAMBA_BOUNDS.lonMax - CALAMBA_BOUNDS.lonMin), 0, 1);
  const southNorm = clamp((CALAMBA_BOUNDS.latMax - lat) / (CALAMBA_BOUNDS.latMax - CALAMBA_BOUNDS.latMin), 0, 1);

  const lakeBelt = clamp((eastNorm - 0.72) / 0.28, 0, 1) * 0.95;
  const makilingSlope = gaussian2D(lat, lon, 14.158, 121.191, 0.026, 0.024) * 1.25;
  const westUpland = gaussian2D(lat, lon, 14.186, 121.056, 0.024, 0.022) * 1.1;
  const riverCorridor = gaussian2D(lat, lon, 14.201, 121.161, 0.018, 0.04) * 0.65;

  const terrainBlend = Math.max(lakeBelt, makilingSlope, westUpland);

  return 1 + terrainBlend + (riverCorridor * 0.55) + (southNorm * 0.18);
}

async function fetchRainfallSignal() {
  const openWeatherApiKey = String(process.env.OPENWEATHER_API_KEY || '').trim();

  if (openWeatherApiKey) {
    const openWeatherUrl =
      `https://api.openweathermap.org/data/2.5/forecast?lat=${CALAMBA_CENTER.latitude}` +
      `&lon=${CALAMBA_CENTER.longitude}&appid=${openWeatherApiKey}&units=metric`;

    const response = await fetch(openWeatherUrl);
    if (response.ok) {
      const payload = await response.json();
      const horizon = Array.isArray(payload?.list) ? payload.list.slice(0, 4) : [];
      const totalRainMm = horizon.reduce((sum, row) => {
        const rain3h = Number(row?.rain?.['3h'] || 0);
        return sum + (Number.isFinite(rain3h) ? rain3h : 0);
      }, 0);

      return {
        source: 'openweather',
        totalRainMm,
        rainBand: toRainBand(totalRainMm),
      };
    }
  }

  const fallbackUrl =
    'https://api.open-meteo.com/v1/forecast?' +
    `latitude=${CALAMBA_CENTER.latitude}&longitude=${CALAMBA_CENTER.longitude}` +
    '&hourly=precipitation&forecast_days=1&timezone=auto';

  const fallbackResponse = await fetch(fallbackUrl);
  if (!fallbackResponse.ok) {
    throw new Error('Failed to fetch rainfall data.');
  }

  const weather = await fallbackResponse.json();
  const precipitation = Array.isArray(weather?.hourly?.precipitation) ? weather.hourly.precipitation : [];
  const nextHours = precipitation.slice(0, 6);
  const totalRainMm = nextHours.reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    source: 'open-meteo-fallback',
    totalRainMm,
    rainBand: toRainBand(totalRainMm),
  };
}

async function fetchWeatherSignalForRainImpact() {
  const openMeteoUrl =
    'https://api.open-meteo.com/v1/forecast?' +
    `latitude=${CALAMBA_CENTER.latitude}&longitude=${CALAMBA_CENTER.longitude}` +
    '&current=temperature_2m,wind_speed_10m,wind_direction_10m' +
    '&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
    '&forecast_hours=24&wind_speed_unit=kmh&timezone=Asia%2FManila';

  const openMeteoResponse = await fetch(openMeteoUrl);
  if (!openMeteoResponse.ok) {
    throw new Error('Failed to fetch weather impact signal.');
  }

  const weather = await openMeteoResponse.json();
  const precipitation = Array.isArray(weather?.hourly?.precipitation) ? weather.hourly.precipitation : [];
  const precipitationProbability = Array.isArray(weather?.hourly?.precipitation_probability)
    ? weather.hourly.precipitation_probability
    : [];
  const weatherCode = Array.isArray(weather?.hourly?.weather_code) ? weather.hourly.weather_code : [];
  const temperatureSeries = Array.isArray(weather?.hourly?.temperature_2m) ? weather.hourly.temperature_2m : [];
  const windSpeed = Array.isArray(weather?.hourly?.wind_speed_10m) ? weather.hourly.wind_speed_10m : [];
  const windDirection = Array.isArray(weather?.hourly?.wind_direction_10m) ? weather.hourly.wind_direction_10m : [];
  const pressureSeries = Array.isArray(weather?.hourly?.surface_pressure) ? weather.hourly.surface_pressure : [];

  const next24hRain = precipitation.slice(0, 24);
  const next6hRain = precipitation.slice(0, 6);
  const next24hProb = precipitationProbability.slice(0, 24);
  const next12hCodes = weatherCode.slice(0, 12);
  const next24hWind = windSpeed.slice(0, 24);
  const next24hPressure = pressureSeries.slice(0, 24);
  const next6hTemperature = temperatureSeries.slice(0, 6).filter((value) => Number.isFinite(Number(value)));

  const rain24hMm = next24hRain.reduce((sum, value) => sum + Number(value || 0), 0);
  const rainIntensityMmPerHour = next6hRain.length > 0
    ? next6hRain.reduce((sum, value) => sum + Number(value || 0), 0) / next6hRain.length
    : 0;

  const thunderCodeDetected = next12hCodes.some((code) => [95, 96, 99].includes(Number(code)));
  const thunderstormProbabilityPct = next24hProb.reduce((max, value) => Math.max(max, Number(value || 0)), 0);
  const thunderWithCode = thunderCodeDetected
    ? Math.max(thunderstormProbabilityPct, 65)
    : thunderstormProbabilityPct;

  const maxWindKph = next24hWind.reduce((max, value) => Math.max(max, Number(value || 0)), 0);
  const minPressureHpa = next24hPressure.reduce((min, value) => {
    const pressure = Number(value);
    if (!Number.isFinite(pressure)) {
      return min;
    }
    return Math.min(min, pressure);
  }, Number.POSITIVE_INFINITY);

  const pathLikelyAffectingCalamba =
    maxWindKph >= 60 ||
    ((maxWindKph >= 45 || minPressureHpa <= 996) && rain24hMm >= 32);

  const impactLevel =
    pathLikelyAffectingCalamba ? 'High' :
      (maxWindKph >= 35 || rain24hMm >= 18 || thunderWithCode >= 65 ? 'Moderate' : 'Low');

  const airTemperatureCelsius = next6hTemperature.length > 0
    ? next6hTemperature.reduce((sum, value) => sum + Number(value), 0) / next6hTemperature.length
    : 30;

  return {
    source: 'open-meteo',
    rainIntensityMmPerHour: Number(Math.max(0, rainIntensityMmPerHour).toFixed(2)),
    airTemperatureCelsius: Number(airTemperatureCelsius.toFixed(2)),
    thunderstormProbabilityPct: Number(clamp(thunderWithCode, 0, 100).toFixed(1)),
    windSpeedKph: Number(Math.max(0, Number(weather?.current?.wind_speed_10m || windSpeed[0] || 0)).toFixed(1)),
    windDirectionDegrees: Number.isFinite(Number(weather?.current?.wind_direction_10m))
      ? Number(weather.current.wind_direction_10m)
      : (Number.isFinite(Number(windDirection[0])) ? Number(windDirection[0]) : 0),
    typhoonForecast: {
      impactLevel,
      pathLikelyAffectingCalamba,
      expectedPeakWindKph: Number(maxWindKph.toFixed(1)),
      expectedRain24hMm: Number(rain24hMm.toFixed(2)),
    },
  };
}

async function buildCalambaRainImpactPayload() {
  const weatherSignal = await fetchWeatherSignalForRainImpact();
  const source = mergeMissingBarangayFeatures(await getCalambaBoundaryOutlinesForOverlay());
  const features = Array.isArray(source?.features) ? source.features : [];
  const temperatureByBarangay = await fetchBarangayTemperatureLookup(
    features,
    Number(weatherSignal.airTemperatureCelsius || 30),
  );

  const typhoonStrength = toTyphoonStrength(
    weatherSignal.typhoonForecast.impactLevel,
    weatherSignal.typhoonForecast.pathLikelyAffectingCalamba,
  );

  const barangayImpacts = features
    .map((feature) => {
      const barangayName = normalizeDisplayBarangayName(feature?.properties?.barangay_name);
      const samplePoints = extractSamplePointsFromGeometry(feature?.geometry);
      if (samplePoints.length === 0) {
        return null;
      }

      const samples = samplePoints.map((point) =>
        rainfallIntensityAtPoint(
          weatherSignal.rainIntensityMmPerHour,
          point.latitude,
          point.longitude,
          weatherSignal.thunderstormProbabilityPct,
          typhoonStrength,
        ),
      );

      const averageRainfallMmPerHour = samples.reduce((sum, value) => sum + Number(value || 0), 0) / samples.length;
      const cityRainIntensity = Math.max(0, Number(weatherSignal.rainIntensityMmPerHour || 0));
      const spatialRainScale = cityRainIntensity > 0.001
        ? clamp(averageRainfallMmPerHour / cityRainIntensity, 0.65, 1.45)
        : 1;
      const rainAccumulation24hMm = Math.max(
        0,
        Number(weatherSignal.typhoonForecast.expectedRain24hMm || 0) * spatialRainScale,
      );
      const rainLevel = toRainLevel(averageRainfallMmPerHour);
      const rainColor = rainLevelColor(rainLevel);
      const stormRisk = toStormRiskLabel(weatherSignal.thunderstormProbabilityPct);
      const typhoonForecastImpact = toTyphoonImpactLabel(
        weatherSignal.typhoonForecast.impactLevel,
        averageRainfallMmPerHour,
        weatherSignal.thunderstormProbabilityPct,
      );
      const centroid = centroidFromCoordinates(extractGeometryCoordinates(feature?.geometry)) || CALAMBA_CENTER;
      const nameKey = canonicalBarangayKey(barangayName);
      const fetchedTemperature = temperatureByBarangay.get(nameKey);
      const temperatureCelsius = Number.isFinite(Number(fetchedTemperature))
        ? Number(fetchedTemperature)
        : adjustedTemperatureCelsius(
          Number(weatherSignal.airTemperatureCelsius || 30),
          Number(centroid.latitude),
          Number(centroid.longitude),
        );

      return {
        barangayName,
        averageRainfallMmPerHour: Number(averageRainfallMmPerHour.toFixed(2)),
        rainIntensityMmPerHour: Number(averageRainfallMmPerHour.toFixed(2)),
        rainAccumulation24hMm: Number(rainAccumulation24hMm.toFixed(2)),
        rainLevel,
        rainColor,
        stormRisk,
        temperatureCelsius,
        thunderstormProbabilityPct: weatherSignal.thunderstormProbabilityPct,
        typhoonForecastImpact,
      };
    })
    .filter(Boolean);

  const byName = new Map(
    barangayImpacts.map((item) => [canonicalBarangayKey(item.barangayName), item]),
  );

  const overlayFeatures = features
    .map((feature) => {
      const nameKey = canonicalBarangayKey(feature?.properties?.barangay_name);
      const impact = byName.get(nameKey);
      if (!impact) {
        return null;
      }

      return {
        type: 'Feature',
        properties: {
          barangay_name: impact.barangayName,
          average_rainfall_mm_per_hour: impact.averageRainfallMmPerHour,
          rain_intensity_mm_per_hour: impact.rainIntensityMmPerHour,
          rain_accumulation_24h_mm: impact.rainAccumulation24hMm,
          rain_level: impact.rainLevel,
          rain_color: impact.rainColor,
          storm_risk: impact.stormRisk,
          temperature_celsius: impact.temperatureCelsius,
          thunderstorm_probability_pct: impact.thunderstormProbabilityPct,
          typhoon_forecast_impact: impact.typhoonForecastImpact,
        },
        geometry: toPolygonGeometry(feature.geometry) || feature.geometry,
      };
    })
    .filter(Boolean);

  const typhoonAffectedCount = barangayImpacts.filter((item) => item.typhoonForecastImpact !== 'Low').length;
  const coveragePct = barangayImpacts.length > 0 ? (typhoonAffectedCount / barangayImpacts.length) * 100 : 0;
  const cityWideTyphoonAlert =
    Boolean(weatherSignal.typhoonForecast.pathLikelyAffectingCalamba) &&
    barangayImpacts.length > 0 &&
    typhoonAffectedCount === barangayImpacts.length;

  return {
    updatedAt: new Date().toISOString(),
    pollIntervalMs: RAIN_IMPACT_CACHE_TTL_MS,
    weatherSource: weatherSignal.source,
    cityWeather: {
      rainIntensityMmPerHour: weatherSignal.rainIntensityMmPerHour,
      airTemperatureCelsius: Number(weatherSignal.airTemperatureCelsius || 30),
      thunderstormProbabilityPct: weatherSignal.thunderstormProbabilityPct,
      windSpeedKph: weatherSignal.windSpeedKph,
      windDirectionDegrees: weatherSignal.windDirectionDegrees,
      typhoonForecast: {
        impactLevel: weatherSignal.typhoonForecast.impactLevel,
        pathLikelyAffectingCalamba: weatherSignal.typhoonForecast.pathLikelyAffectingCalamba,
        expectedPeakWindKph: weatherSignal.typhoonForecast.expectedPeakWindKph,
        expectedRain24hMm: weatherSignal.typhoonForecast.expectedRain24hMm,
      },
      cityWideTyphoonAlert: {
        active: cityWideTyphoonAlert,
        affectedBarangays: typhoonAffectedCount,
        totalBarangays: barangayImpacts.length,
        coveragePct: Number(coveragePct.toFixed(1)),
        message: cityWideTyphoonAlert
          ? 'Typhoon path signal indicates city-wide impact across all Calamba barangays. Immediate city-wide preparedness is advised.'
          : 'No full city-wide typhoon path impact detected at this time.',
      },
    },
    barangayImpacts,
    barangayOverlay: {
      type: 'FeatureCollection',
      features: overlayFeatures,
    },
  };
}

function buildFullCalambaRaster(rainfall) {
  const features = [];
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  const rainAdj = rainfallScore(rainfall.rainBand);

  for (let lat = CALAMBA_BOUNDS.latMin; lat < CALAMBA_BOUNDS.latMax; lat += RASTER_CELL_STEP) {
    for (let lon = CALAMBA_BOUNDS.lonMin; lon < CALAMBA_BOUNDS.lonMax; lon += RASTER_CELL_STEP) {
      const centerLat = lat + RASTER_CELL_STEP / 2;
      const centerLon = lon + RASTER_CELL_STEP / 2;

      const baseScore = baseHazardScore(centerLat, centerLon);
      const score = baseScore + rainAdj;
      const riskLevel = classifyRisk(score);
      const color = riskColor(riskLevel);
      const recommendation = recommendationByRisk(riskLevel);

      counts[riskLevel] += 1;

      features.push({
        type: 'Feature',
        properties: {
          riskLevel,
          color,
          recommendation,
          intensity: Number(clamp((score - 1.2) / 2.4, 0.08, 1).toFixed(3)),
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [lon, lat],
            [Math.min(lon + RASTER_CELL_STEP, CALAMBA_BOUNDS.lonMax), lat],
            [Math.min(lon + RASTER_CELL_STEP, CALAMBA_BOUNDS.lonMax), Math.min(lat + RASTER_CELL_STEP, CALAMBA_BOUNDS.latMax)],
            [lon, Math.min(lat + RASTER_CELL_STEP, CALAMBA_BOUNDS.latMax)],
            [lon, lat],
          ]],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
    counts,
  };
}

async function getCalambaFloodRisk(req, res) {
  try {
    const rainfall = await fetchRainfallSignal();
    const raster = buildFullCalambaRaster(rainfall);

    return res.json({
      updatedAt: new Date().toISOString(),
      rainfall: {
        source: rainfall.source,
        totalRainMm: Number(rainfall.totalRainMm.toFixed(2)),
        rainBand: rainfall.rainBand.toUpperCase(),
      },
      summary: {
        low: raster.counts.LOW,
        medium: raster.counts.MEDIUM,
        high: raster.counts.HIGH,
      },
      zones: [],
      decisionSupport: {
        high: 'Evacuate immediately',
        medium: 'Prepare resources',
        low: 'Monitor conditions',
      },
      model: 'Calamba Raster Flood Heat = terrain proxies (lakeshore/slope/corridor) + rainfall trigger',
    });
  } catch (error) {
    console.error('Failed to compute Calamba flood risk:', error.message);
    return res.status(500).json({ message: 'Failed to compute Calamba flood risk.' });
  }
}

async function getCalambaFloodZones(req, res) {
  return res.json({
    type: 'FeatureCollection',
    features: [],
    metadata: {
      note: 'Polygon hazard zones are disabled. Use raster endpoint for HazardHunter-style visualization.',
    },
  });
}

async function getCalambaFloodRaster(req, res) {
  try {
    const rainfall = await fetchRainfallSignal();
    const raster = buildFullCalambaRaster(rainfall);

    return res.json({
      type: 'FeatureCollection',
      features: raster.features,
      metadata: {
        cellSizeDegrees: RASTER_CELL_STEP,
        generatedAt: new Date().toISOString(),
        note: 'Full-Calamba raster hazard grid inspired by HazardHunter-style flood heat presentation.',
      },
    });
  } catch (error) {
    console.error('Failed to build flood raster:', error.message);
    return res.status(500).json({ message: 'Failed to load flood raster data.' });
  }
}

async function getCalambaBarangayBoundaries(req, res) {
  try {
    if (!cachedBarangayBoundaryOutlines) {
      const persisted = loadPersistedBoundaryOutlines();
      if (persisted) {
        cachedBarangayBoundaryOutlines = mergeMissingBarangayFeatures(persisted);
        cachedBarangayBoundaryOutlinesAt = Date.now();
      }
    }

    const now = Date.now();
    if (cachedBarangayBoundaryOutlines && now - cachedBarangayBoundaryOutlinesAt < BARANGAY_BOUNDARY_CACHE_TTL_MS) {
      return res.json(mergeMissingBarangayFeatures(cachedBarangayBoundaryOutlines));
    }

    const next = await buildCalambaBarangayBoundaryGeoJson();
    if (!Array.isArray(next?.features) || next.features.length === 0) {
      throw new Error('No barangay boundary outlines were returned by Overpass.');
    }

    const merged = mergeMissingBarangayFeatures(next);
    cachedBarangayBoundaryOutlines = merged;
    cachedBarangayBoundaryOutlinesAt = now;
    persistBoundaryOutlines(merged);
    return res.json(merged);
  } catch (error) {
    console.error('Failed to load Calamba barangay boundaries:', error.message);
    if (cachedBarangayBoundaryOutlines) {
      return res.json(mergeMissingBarangayFeatures(cachedBarangayBoundaryOutlines));
    }

    const persisted = loadPersistedBoundaryOutlines();
    if (persisted) {
      return res.json(mergeMissingBarangayFeatures(persisted));
    }

    return res.status(503).json({ message: 'Failed to load Calamba barangay boundaries from OSM source.' });
  }
}

async function getCalambaBarangayPolygons(req, res) {
  try {
    const source = getCachedBarangayBoundaries();
    return res.json(source);
  } catch (error) {
    console.error('Failed to load Calamba barangay polygons:', error.message);
    return res.status(500).json({ message: 'Failed to load Calamba barangay polygons.' });
  }
}

async function getCalambaRainImpact(req, res) {
  try {
    const now = Date.now();
    if (cachedRainImpactPayload && now - cachedRainImpactAt < RAIN_IMPACT_CACHE_TTL_MS) {
      return res.json(cachedRainImpactPayload);
    }

    const payload = await buildCalambaRainImpactPayload();
    cachedRainImpactPayload = payload;
    cachedRainImpactAt = now;
    return res.json(payload);
  } catch (error) {
    console.error('Failed to load Calamba rain impact:', error.message);
    if (cachedRainImpactPayload) {
      return res.json(cachedRainImpactPayload);
    }
    return res.status(500).json({ message: 'Failed to load Calamba rain impact data.' });
  }
}

module.exports = {
  getCalambaFloodRisk,
  getCalambaFloodZones,
  getCalambaFloodRaster,
  getCalambaBarangayBoundaries,
  getCalambaBarangayPolygons,
  getCalambaRainImpact,
};
