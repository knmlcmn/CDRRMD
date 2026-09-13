import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import PlatformMap from '../components/PlatformMap';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { api, setApiAuthorizationToken } from '../services/api';
import { fetchRoadRoute } from '../services/routingService';
import { loadSession } from '../services/session';

type Coordinate = { latitude: number; longitude: number };
type EvacuationArea = {
  id: string;
  name: string;
  barangay: string;
  placeType: string;
  locationText: string;
  capacity: number;
  evacuees: number;
  latitude: number;
  longitude: number;
};
type RescueCandidate = {
  area: EvacuationArea;
  distanceKm: number;
  path: string[];
};
type RescuePlan = {
  area: EvacuationArea;
  distanceKm: number;
  etaMinutes: number;
  etaText: string;
  routeCoordinates: Coordinate[];
  source: 'osrm' | 'dijkstra';
};

type RescueRecord = {
  id: number;
  report_code?: string | null;
  status: 'Pending' | 'Accepted' | 'In Progress' | 'Resolved' | 'Declined';
  created_at: string;
  updated_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  assigned_team?: string | null;
  decline_explanation?: string | null;
};

type UserMapLayerVisibility = {
  boundary: boolean;
  evacuationAreas: boolean;
  userMarker: boolean;
  route: boolean;
  raster: boolean;
  weatherOverlay: boolean;
};

function findNearestAvailableArea(userLocation: Coordinate, evacuationAreas: EvacuationArea[]) {
  const available = evacuationAreas.filter((area) => !isAreaFull(area));
  if (available.length === 0) {
    return null;
  }

  return available
    .map((area) => ({ area, straightKm: haversineKm(area, userLocation) }))
    .sort((a, b) => a.straightKm - b.straightKm)[0]?.area || null;
}

function normalizeRescueStatus(value: unknown): RescueRecord['status'] {
  const normalized = String(value || 'pending').toLowerCase();
  if (normalized === 'accepted') {
    return 'Accepted';
  }
  if (normalized === 'in_progress') {
    return 'In Progress';
  }
  if (normalized === 'resolved') {
    return 'Resolved';
  }
  if (normalized === 'declined') {
    return 'Declined';
  }
  return 'Pending';
}

function normalizeEvacueesValue(item: any) {
  const rescued = Number(item?.rescued_evacuees);
  if (Number.isFinite(rescued)) {
    return Math.max(0, rescued);
  }

  const fallback = Number(item?.evacuees);
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

function isAreaFull(area: EvacuationArea) {
  return area.capacity > 0 && area.evacuees >= area.capacity;
}

const CALAMBA_BOUNDS = {
  latMin: 14.137703,
  latMax: 14.2662133,
  lonMin: 121.0218057,
  lonMax: 121.2214277,
};

const CALAMBA_NOMINATIM = {
  latitude: 14.206021,
  longitude: 121.1556496,
  bounds: [
    [14.137703, 121.0218057],
    [14.2662133, 121.2214277],
  ] as [[number, number], [number, number]],
};

const CALAMBA_BOUNDARY_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Calamba City Boundary' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.0218057, 14.137703],
          [121.0702, 14.2531],
          [121.1434, 14.2662133],
          [121.2214277, 14.2498],
          [121.2098, 14.1712],
          [121.1784, 14.1425],
          [121.0896, 14.1397],
          [121.0218057, 14.137703],
        ]],
      },
    },
  ],
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const NOMINATIM_BARANGAY_CENTERS: Record<string, Coordinate> = {
  Palingon: { latitude: 14.2145, longitude: 121.1886 },
  Lingga: { latitude: 14.205, longitude: 121.1734 },
  Sampiruhan: { latitude: 14.2145, longitude: 121.1801 },
  Looc: { latitude: 14.205, longitude: 121.1819 },
  Uwisan: { latitude: 14.199, longitude: 121.1411 },
  Parian: { latitude: 14.205, longitude: 121.1904 },
};

function isLandPoint(point: Coordinate) {
  if (
    point.latitude < CALAMBA_BOUNDS.latMin ||
    point.latitude > CALAMBA_BOUNDS.latMax ||
    point.longitude < CALAMBA_BOUNDS.lonMin ||
    point.longitude > CALAMBA_BOUNDS.lonMax
  ) {
    return false;
  }

  const shorelineLonByLat =
    point.latitude < 14.19
      ? 121.188
      : point.latitude < 14.205
        ? 121.195
        : point.latitude < 14.22
          ? 121.201
          : point.latitude < 14.24
            ? 121.208
            : point.latitude < 14.255
              ? 121.213
              : 121.218;

  const likelyLagunaBayWater = point.longitude > shorelineLonByLat;
  return !likelyLagunaBayWater;
}

function snapToLandPoint(rawPoint: Coordinate) {
  const start = {
    latitude: clamp(rawPoint.latitude, CALAMBA_BOUNDS.latMin + 0.001, CALAMBA_BOUNDS.latMax - 0.001),
    longitude: clamp(rawPoint.longitude, CALAMBA_BOUNDS.lonMin + 0.001, CALAMBA_BOUNDS.lonMax - 0.001),
  };

  if (isLandPoint(start)) {
    return start;
  }

  const angleSteps = 18;
  for (let ring = 1; ring <= 18; ring += 1) {
    const radius = ring * 0.0011;
    for (let step = 0; step < angleSteps; step += 1) {
      const angle = (2 * Math.PI * step) / angleSteps;
      const candidate = {
        latitude: clamp(start.latitude + Math.sin(angle) * radius, CALAMBA_BOUNDS.latMin + 0.001, CALAMBA_BOUNDS.latMax - 0.001),
        longitude: clamp(start.longitude + Math.cos(angle) * radius, CALAMBA_BOUNDS.lonMin + 0.001, CALAMBA_BOUNDS.lonMax - 0.001),
      };

      if (isLandPoint(candidate)) {
        return candidate;
      }
    }
  }

  return { latitude: 14.2117, longitude: 121.1653 };
}

function createEvacuationAreas() {
  const siteTemplates = [
    { suffix: 'Covered Court', angleDeg: 30, radius: 0.0028 },
    { suffix: 'Elementary School', angleDeg: 160, radius: 0.0031 },
    { suffix: 'Multi-purpose Hall', angleDeg: 290, radius: 0.0029 },
  ];

  const anchoredBarangays = Object.entries(NOMINATIM_BARANGAY_CENTERS);

  return anchoredBarangays.flatMap(([barangay, anchor], index) => {
    const centerPoint = snapToLandPoint(anchor);

    return siteTemplates.map((site, siteIndex) => {
      const angle = (site.angleDeg * Math.PI) / 180;
      const rawPoint = {
        latitude: centerPoint.latitude + Math.sin(angle) * site.radius,
        longitude: centerPoint.longitude + Math.cos(angle) * site.radius,
      };
      const snapped = snapToLandPoint(rawPoint);
      const capacity = 120 + ((index * 19 + siteIndex * 41) % 240);
      const evacuees = 0;
      const placeType = site.suffix;
      const locationText = `${barangay} ${placeType}, Barangay ${barangay}, Calamba City, Laguna, Philippines`;

      return {
        id: `E${index + 1}-${siteIndex + 1}`,
        barangay,
        name: `${barangay} ${site.suffix}`,
        address: `Barangay ${barangay}, Calamba City`,
        placeType,
        locationText,
        capacity,
        evacuees,
        latitude: snapped.latitude,
        longitude: snapped.longitude,
      };
    });
  });
}

const fallbackEvacuationAreas = createEvacuationAreas();

const junctionNodes: Array<{ id: string; latitude: number; longitude: number }> = [
  { id: 'J1', latitude: 14.2202, longitude: 121.1658 },
  { id: 'J2', latitude: 14.2088, longitude: 121.1768 },
  { id: 'J3', latitude: 14.2146, longitude: 121.1521 },
  { id: 'J4', latitude: 14.2012, longitude: 121.1678 },
  { id: 'J5', latitude: 14.2302, longitude: 121.1719 },
  { id: 'J6', latitude: 14.2243, longitude: 121.1908 },
  { id: 'J7', latitude: 14.1968, longitude: 121.1879 },
  { id: 'J8', latitude: 14.2355, longitude: 121.1444 },
];

const junctionEdges: Array<[string, string]> = [
  ['J1', 'J2'],
  ['J1', 'J3'],
  ['J1', 'J5'],
  ['J2', 'J4'],
  ['J2', 'J5'],
  ['J2', 'J6'],
  ['J2', 'J7'],
  ['J3', 'J5'],
  ['J3', 'J8'],
  ['J3', 'J4'],
  ['J4', 'J7'],
  ['J5', 'J6'],
  ['J5', 'J8'],
  ['J6', 'J7'],
];

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: Coordinate, b: Coordinate) {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function buildGraph(userLocation: Coordinate, evacuationAreas: EvacuationArea[]) {
  const userNode = { id: 'U', latitude: userLocation.latitude, longitude: userLocation.longitude };
  const nodes = [...evacuationAreas, ...junctionNodes, userNode];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const adj = new Map<string, Array<{ to: string; weight: number }>>();

  nodes.forEach((node) => adj.set(node.id, []));

  junctionEdges.forEach(([a, b]) => {
    const from = nodeMap.get(a);
    const to = nodeMap.get(b);
    if (!from || !to) {
      return;
    }

    const distance = haversineKm(from, to) * 1.28;
    adj.get(a)?.push({ to: b, weight: distance });
    adj.get(b)?.push({ to: a, weight: distance });
  });

  evacuationAreas.forEach((area) => {
    const nearestJunctions = junctionNodes
      .map((junction) => ({ id: junction.id, distance: haversineKm(area, junction) * 1.12 }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);

    nearestJunctions.forEach((item) => {
      adj.get(area.id)?.push({ to: item.id, weight: item.distance });
      adj.get(item.id)?.push({ to: area.id, weight: item.distance });
    });
  });

  const nearestJunctions = junctionNodes
    .map((node) => ({ id: node.id, distance: haversineKm(userNode, node) * 1.18 }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  nearestJunctions.forEach((item) => {
    adj.get('U')?.push({ to: item.id, weight: item.distance });
    adj.get(item.id)?.push({ to: 'U', weight: item.distance });
  });

  return { nodes: nodeMap, adj };
}

function dijkstra(
  adj: Map<string, Array<{ to: string; weight: number }>>,
  source: string,
  target: string,
) {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const unvisited = new Set<string>(Array.from(adj.keys()));

  unvisited.forEach((key) => {
    dist.set(key, Number.POSITIVE_INFINITY);
    prev.set(key, null);
  });
  dist.set(source, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentDist = Number.POSITIVE_INFINITY;

    unvisited.forEach((node) => {
      const nodeDist = dist.get(node) ?? Number.POSITIVE_INFINITY;
      if (nodeDist < currentDist) {
        currentDist = nodeDist;
        current = node;
      }
    });

    if (!current || current === target || currentDist === Number.POSITIVE_INFINITY) {
      break;
    }

    unvisited.delete(current);
    const neighbors = adj.get(current) ?? [];
    neighbors.forEach((neighbor) => {
      if (!unvisited.has(neighbor.to)) {
        return;
      }

      const alt = currentDist + neighbor.weight;
      if (alt < (dist.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(neighbor.to, alt);
        prev.set(neighbor.to, current);
      }
    });
  }

  const path: string[] = [];
  let cursor: string | null = target;
  while (cursor) {
    path.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }

  return {
    distanceKm: dist.get(target) ?? Number.POSITIVE_INFINITY,
    path: path[0] === source ? path : [],
  };
}

function formatEtaText(etaMinutes: number) {
  return `${Math.max(etaMinutes - 1, 1)} - ${etaMinutes + 3} mins`;
}

async function resolveFastestRoadPlan(
  userLocation: Coordinate,
  evacuationAreas: EvacuationArea[],
): Promise<RescuePlan | null> {
  const candidateAreas = evacuationAreas
    .filter((area) => !isAreaFull(area))
    .map((area) => ({ area, straightKm: haversineKm(area, userLocation) }))
    .sort((a, b) => a.straightKm - b.straightKm)
    .slice(0, 12)
    .map((item) => item.area);

  const routes = await Promise.all(
    candidateAreas.map(async (area) => {
      try {
        const road = await fetchRoadRoute(
          { latitude: area.latitude, longitude: area.longitude },
          userLocation,
          true,
          3,
        );

        return {
          area,
          distanceKm: road.distanceKm,
          etaMinutes: road.etaMinutes,
          etaText: formatEtaText(road.etaMinutes),
          routeCoordinates: road.routeCoordinates,
          source: 'osrm' as const,
        };
      } catch {
        return null;
      }
    }),
  );

  const valid = routes.filter(Boolean) as Array<NonNullable<(typeof routes)[number]>>;
  if (valid.length === 0) {
    return null;
  }

  valid.sort((a, b) => a.etaMinutes - b.etaMinutes);
  return valid[0];
}

function buildLeafletHtml(
  userLocation: Coordinate,
  allAreas: EvacuationArea[],
  selectedAreaId: EvacuationArea['id'] | null,
  showAreas: boolean,
  routeCoordinates: Coordinate[],
  apiBaseUrl: string,
  layerVisibility: UserMapLayerVisibility,
) {
  const serialized = JSON.stringify({
    userLocation,
    allAreas,
    selectedAreaId,
    showAreas,
    routeCoordinates,
    apiBaseUrl,
    layerVisibility,
    boundaryGeoJson: CALAMBA_BOUNDARY_GEOJSON,
  });

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
    <style>
      html,body,#map{margin:0;padding:0;width:100%;height:100%}
      body{margin:0;padding:0;background:#eef2f7}
      .map-legend{
        background:rgba(255,255,255,.94);
        border:1px solid #cbd5e1;
        border-radius:10px;
        box-shadow:0 4px 14px rgba(15,23,42,.2);
        color:#0f172a;
        font:12px/1.35 Arial,sans-serif;
        padding:8px 10px;
        pointer-events:none;
        width:192px;
      }
      .legend-toggle{
        background:rgba(15,23,42,.9);
        border:1px solid #1e3a5f;
        border-radius:8px;
        color:#fff;
        cursor:pointer;
        font:700 11px/1 Arial,sans-serif;
        padding:8px 10px;
      }
      .map-legend .title{font-weight:700;margin-bottom:6px}
      .map-legend .row{align-items:center;display:flex;margin:3px 0}
      .map-legend .swatch{border:1px solid rgba(15,23,42,.25);height:12px;margin-right:6px;width:12px}
      .map-legend .line{border-top:3px solid #111111;margin-right:6px;width:14px}
      .map-legend .pin{background:#e11d48;border:2px solid #fff;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.25);height:10px;margin-right:6px;width:10px}
      .map-legend .user{background:#ef4444;border:2px solid #fff;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.25);height:10px;margin-right:6px;width:10px}
      .map-legend .route{border-top:4px solid #16a34a;margin-right:6px;width:16px}
      .map-legend .updated{color:#64748b;font-size:10px;margin-top:5px}
      .legend-section-label{align-items:center;border-top:1px solid #e2e8f0;color:#1e40af;display:flex;font-size:10px;font-weight:800;gap:5px;margin-top:7px;padding-top:5px;text-transform:uppercase;letter-spacing:0.04em}
      .legend-section-dot{border-radius:999px;display:inline-block;flex-shrink:0;height:8px;width:8px}
      .flood-info{font:13px/1.35 Arial,sans-serif;min-width:220px}
      .flood-info .head{background:#0891b2;color:#fff;font-weight:800;margin:-10px -12px 10px;padding:10px 12px}
      .flood-info table{border-collapse:collapse;width:100%}
      .flood-info td{border:1px solid #cbd5e1;padding:6px 8px}
      .flood-info td:first-child{background:#f8fafc;font-weight:700;width:42%}
      .map-rain-canvas{inset:0;pointer-events:none;position:absolute;z-index:430}.weather-live-hud{backdrop-filter:blur(7px);background:rgba(15,23,42,.82);border:1px solid rgba(125,211,252,.45);border-radius:9px;color:#fff;display:none;font:700 10px/1.35 Arial,sans-serif;left:50%;padding:6px 9px;pointer-events:none;position:absolute;top:10px;transform:translateX(-50%);z-index:700;white-space:nowrap;box-shadow:0 4px 18px rgba(2,8,23,.3)}.weather-live-hud b{color:#7dd3fc}
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      var data = ${serialized};
      var visibility = Object.assign({
        boundary: true,
        evacuationAreas: true,
        userMarker: true,
        route: true,
        raster: false,
        weatherOverlay: true
      }, data.layerVisibility || {});
      var calambaCenter = [${CALAMBA_NOMINATIM.latitude}, ${CALAMBA_NOMINATIM.longitude}];
      var calambaBounds = L.latLngBounds([
        [${CALAMBA_NOMINATIM.bounds[0][0]}, ${CALAMBA_NOMINATIM.bounds[0][1]}],
        [${CALAMBA_NOMINATIM.bounds[1][0]}, ${CALAMBA_NOMINATIM.bounds[1][1]}]
      ]);
      var map = L.map('map', {
        zoomControl: true,
        attributionControl: false,
        minZoom: 11,
        maxZoom: 18,
        maxBounds: calambaBounds.pad(0.08),
        maxBoundsViscosity: 0.8,
      }).setView([data.userLocation.latitude, data.userLocation.longitude], 14);

      var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''
      }).addTo(map);

      function applyIronMapTint() {
        var tilePane = map.getPanes().tilePane;
        if (tilePane) {
          tilePane.style.filter = Boolean(visibility.weatherOverlay)
            ? 'grayscale(1) brightness(0.62) sepia(0.18) hue-rotate(175deg) saturate(0.55)'
            : '';
        }
      }

      var legendVisible = false;
      var legendControl = null;
      var legendToggleControl = null;

      function buildLegendHtml() {
        var weatherOn = Boolean(visibility.weatherOverlay);
        var floodOn = Boolean(visibility.raster);

        var floodSection = '';
        if (floodOn) {
          floodSection =
            '<div class="legend-section-label">' +
              '<span class="legend-section-dot" style="background:#2563eb;"></span>' +
              'Flood Hazard Zones' +
            '</div>' +
            '<div class="row"><span class="swatch" style="background:#dc2626;"></span>High Risk</div>' +
            '<div class="row"><span class="swatch" style="background:#eab308;"></span>Medium Risk</div>' +
            '<div class="row"><span class="swatch" style="background:#16a34a;"></span>Low Risk</div>';
        }

        var rainSection = '';
        if (weatherOn) {
          rainSection =
            '<div class="legend-section-label" style="margin-top:' + (floodOn ? '6px' : '0') + '">' +
              '<span class="legend-section-dot" style="background:#0ea5e9;"></span>' +
              'Rain Intensity' +
            '</div>' +
            '<div class="row"><span class="swatch" style="background:#16a34a;"></span>Light</div>' +
            '<div class="row"><span class="swatch" style="background:#eab308;"></span>Moderate</div>' +
            '<div class="row"><span class="swatch" style="background:#dc2626;"></span>Heavy</div>' +
            '<div class="row"><span class="swatch" style="background:#7f1d1d;"></span>Severe</div>';
        }

        var noLayers = !floodOn && !weatherOn;
        return (
          '<div class="map-legend">' +
            '<div class="title">Map Legend</div>' +
            (noLayers
              ? '<div style="color:#64748b;font-size:10px;margin-top:4px;">Enable Flood Hazard or Live Weather layers to see color indicators.</div>'
              : (floodSection + rainSection)
            ) +
          '</div>'
        );
      }

      function renderLegendControl() {
        if (!legendToggleControl) {
          legendToggleControl = L.control({ position: 'bottomleft' });
          legendToggleControl.onAdd = function() {
            var button = L.DomUtil.create('button', 'legend-toggle');
            button.type = 'button';
            button.textContent = legendVisible ? 'Hide Legend' : 'Show Legend';
            L.DomEvent.disableClickPropagation(button);
            L.DomEvent.on(button, 'click', function(event) {
              L.DomEvent.stopPropagation(event);
              legendVisible = !legendVisible;
              button.textContent = legendVisible ? 'Hide Legend' : 'Show Legend';
              renderLegendControl();
            });
            return button;
          };
          legendToggleControl.addTo(map);
        }

        if (legendControl) {
          map.removeControl(legendControl);
          legendControl = null;
        }

        if (legendVisible) {
          legendControl = L.control({ position: 'bottomleft' });
          legendControl.onAdd = function() {
            var wrap = L.DomUtil.create('div');
            wrap.innerHTML = buildLegendHtml();
            var first = wrap.firstChild;
            if (first) {
              L.DomEvent.disableClickPropagation(first);
              return first;
            }
            return L.DomUtil.create('div', 'map-legend');
          };
          legendControl.addTo(map);
        }
      }

      function inCalamba(lat, lon) {
        return calambaBounds.contains([lat, lon]);
      }

      function isWithinCalambaBoundary(latlng) {
        var boundaryFeature = data.boundaryGeoJson && data.boundaryGeoJson.features && data.boundaryGeoJson.features[0];
        var ring = boundaryFeature && boundaryFeature.geometry && boundaryFeature.geometry.coordinates && boundaryFeature.geometry.coordinates[0];
        if (!Array.isArray(ring) || ring.length < 4) {
          return false;
        }

        var x = Number(latlng.lng);
        var y = Number(latlng.lat);
        var inside = false;

        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          var xi = Number(ring[i][0]);
          var yi = Number(ring[i][1]);
          var xj = Number(ring[j][0]);
          var yj = Number(ring[j][1]);

          var intersects = ((yi > y) !== (yj > y)) &&
            (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
          if (intersects) {
            inside = !inside;
          }
        }

        return inside;
      }

      function toCapitalWord(value) {
        var text = String(value || '');
        if (!text) {
          return '-';
        }
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      }

      var boundaryLayer = L.layerGroup();
      var floodHazardLayer = L.layerGroup();
      var weatherFillLayer = L.layerGroup();
      var areaLayer = L.layerGroup();
      var userLayer = L.layerGroup();
      var routeLayer = L.layerGroup();

      var weatherImpactByBarangay = {};
      var cityRainIntensityMmPerHour = 0;
      var cityWindSpeedKph=8,cityWindDirectionDegrees=225,cityThunderstormProbabilityPct=0;
      var rainCanvas = null;
      var rainCtx = null;
      var rainDrops = [];
      var rainAnimationFrame = null;
      var rainDropCount = 0;
      var windParticles=[],weatherFrameTick=0,lightningFrames=0,weatherHud=null;

      function ensureRainCanvas() {
        if (rainCanvas) return;
        var pane = map.getPanes && map.getPanes().overlayPane;
        if (!pane) return;
        rainCanvas = document.createElement('canvas');
        rainCanvas.className = 'map-rain-canvas';
        pane.appendChild(rainCanvas);
        rainCtx = rainCanvas.getContext('2d');
        weatherHud=document.createElement('div');weatherHud.className='weather-live-hud';map.getContainer().appendChild(weatherHud);
        refreshRainCanvasSize();
      }

      function refreshRainCanvasSize() {
        if (!rainCanvas) return;
        var size = map.getSize();
        rainCanvas.width = Math.max(1, Number(size.x) || 1);
        rainCanvas.height = Math.max(1, Number(size.y) || 1);
      }

      function toRainDropCount(rainMmPerHour) {
        var mm = Number(rainMmPerHour);
        if (!Number.isFinite(mm) || mm < 0) mm = 0;
        if(mm<.1)return 0;return Math.round(45+Math.min(380,mm*38));
      }

      function seedWindParticles(){if(!rainCanvas)return;var count=Math.round(110+Math.min(230,Math.max(0,cityWindSpeedKph)*3));windParticles=[];for(var i=0;i<count;i+=1)windParticles.push({x:Math.random()*rainCanvas.width,y:Math.random()*rainCanvas.height,age:Math.random()*140,life:65+Math.random()*120,length:7+Math.random()*18,alpha:.16+Math.random()*.42,phase:Math.random()*Math.PI*2});}
      function updateWeatherHud(){if(!weatherHud)return;weatherHud.style.display=Boolean(visibility.weatherOverlay)?'block':'none';var condition=cityThunderstormProbabilityPct>=55?'THUNDERSTORM':cityRainIntensityMmPerHour>=7.5?'HEAVY RAIN':cityRainIntensityMmPerHour>=.1?'RAIN':'WIND';weatherHud.innerHTML='<b>LIVE '+condition+'</b> &nbsp; Rain '+cityRainIntensityMmPerHour.toFixed(1)+' mm/h &nbsp; Wind '+cityWindSpeedKph.toFixed(0)+' km/h &nbsp; Thunder '+cityThunderstormProbabilityPct.toFixed(0)+'%';}

      function seedRainDrops(count) {
        if (!rainCanvas) return;
        rainDrops = [];
        for (var i = 0; i < count; i++) {
          rainDrops.push({
            x: Math.random() * rainCanvas.width,
            y: Math.random() * rainCanvas.height,
            len: 8 + Math.random() * 10,
            speed: 3.8 + Math.random() * 4.4,
            drift: -0.6 - Math.random() * 1.1,
            alpha: 0.22 + Math.random() * 0.3,
          });
        }
      }

      function animateRainCanvas() {
        if (!rainCtx || !rainCanvas || !Boolean(visibility.weatherOverlay)) {
          rainAnimationFrame = null;
          return;
        }
        rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
        weatherFrameTick+=1;
        var ring = data.boundaryGeoJson && data.boundaryGeoJson.features && data.boundaryGeoJson.features[0]
          && data.boundaryGeoJson.features[0].geometry && data.boundaryGeoJson.features[0].geometry.coordinates
          ? data.boundaryGeoJson.features[0].geometry.coordinates[0] : null;
        if (Array.isArray(ring) && ring.length >= 4) {
          rainCtx.save();
          rainCtx.beginPath();
          ring.forEach(function(coord, idx) {
            var pt = map.latLngToContainerPoint([Number(coord[1]), Number(coord[0])]);
            if (idx === 0) rainCtx.moveTo(pt.x, pt.y);
            else rainCtx.lineTo(pt.x, pt.y);
          });
          rainCtx.closePath();
          rainCtx.clip();
        }
        if(cityRainIntensityMmPerHour>=.1){var strength=Math.min(1,cityRainIntensityMmPerHour/16);for(var band=0;band<3;band+=1){var bx=((weatherFrameTick*(.08+band*.025)+band*rainCanvas.width*.38)%(rainCanvas.width*1.5))-rainCanvas.width*.25;var by=rainCanvas.height*(.25+band*.24)+Math.sin(weatherFrameTick*.004+band)*35;var radius=Math.max(90,rainCanvas.width*(.18+strength*.08));var gradient=rainCtx.createRadialGradient(bx,by,0,bx,by,radius);var core=cityRainIntensityMmPerHour>=15?'220,38,38':cityRainIntensityMmPerHour>=7.5?'234,179,8':'34,197,94';gradient.addColorStop(0,'rgba('+core+','+(.10+strength*.12)+')');gradient.addColorStop(.48,'rgba(14,165,233,'+(.08+strength*.1)+')');gradient.addColorStop(1,'rgba(14,165,233,0)');rainCtx.fillStyle=gradient;rainCtx.fillRect(bx-radius,by-radius,radius*2,radius*2);}}
        var flowAngle=(cityWindDirectionDegrees+90)*Math.PI/180,flowSpeed=.65+Math.min(4.2,cityWindSpeedKph/18),vx=Math.cos(flowAngle)*flowSpeed,vy=Math.sin(flowAngle)*flowSpeed;for(var w=0;w<windParticles.length;w+=1){var particle=windParticles[w],curve=Math.sin(weatherFrameTick*.018+particle.phase+particle.y*.012)*.48,px=particle.x+Math.cos(flowAngle+Math.PI/2)*curve,py=particle.y+Math.sin(flowAngle+Math.PI/2)*curve;rainCtx.strokeStyle='rgba(238,248,255,'+particle.alpha+')';rainCtx.lineWidth=cityWindSpeedKph>=45?1.35:.9;rainCtx.beginPath();rainCtx.moveTo(px,py);rainCtx.quadraticCurveTo(px-vx*particle.length*.55+curve*3,py-vy*particle.length*.55,px-vx*particle.length,py-vy*particle.length);rainCtx.stroke();particle.x+=vx;particle.y+=vy;particle.age+=1;if(particle.age>particle.life||particle.x< -35||particle.x>rainCanvas.width+35||particle.y< -35||particle.y>rainCanvas.height+35){particle.x=Math.random()*rainCanvas.width;particle.y=Math.random()*rainCanvas.height;particle.age=0;}}
        for (var i = 0; i < rainDrops.length; i++) {
          var drop = rainDrops[i];
          rainCtx.strokeStyle='rgba(226,240,255,'+Math.min(.82,drop.alpha+cityRainIntensityMmPerHour/45)+')';rainCtx.lineWidth=cityRainIntensityMmPerHour>=7.5?1.4:1;
          rainCtx.beginPath();
          rainCtx.moveTo(drop.x, drop.y);
          rainCtx.lineTo(drop.x + drop.drift, drop.y + drop.len);
          rainCtx.stroke();
          drop.x+=drop.drift*.22+vx*.32;drop.y+=drop.speed+Math.max(0,vy*.18);
          if (drop.y > rainCanvas.height + 16 || drop.x < -16) {
            drop.x = Math.random() * rainCanvas.width;
            drop.y = -14;
          }
        }
        if(cityThunderstormProbabilityPct>=35&&lightningFrames<=0&&Math.random()<(cityThunderstormProbabilityPct/100)*.0022)lightningFrames=7;if(lightningFrames>0){rainCtx.fillStyle='rgba(235,244,255,'+(lightningFrames/18)+')';rainCtx.fillRect(0,0,rainCanvas.width,rainCanvas.height);if(lightningFrames>=5){var lx=rainCanvas.width*(.2+Math.random()*.6);rainCtx.strokeStyle='rgba(255,255,255,.9)';rainCtx.lineWidth=2.2;rainCtx.beginPath();rainCtx.moveTo(lx,0);for(var ly=18;ly<rainCanvas.height*.62;ly+=22){lx+=(Math.random()-.5)*26;rainCtx.lineTo(lx,ly);}rainCtx.stroke();}lightningFrames-=1;}
        if (Array.isArray(ring) && ring.length >= 4) rainCtx.restore();
        rainAnimationFrame = requestAnimationFrame(animateRainCanvas);
      }

      function updateRainEffectVisibility() {
        ensureRainCanvas();
        if (!rainCanvas) return;
        var enabled = Boolean(visibility.weatherOverlay);
        rainCanvas.style.display = enabled ? 'block' : 'none';
        updateWeatherHud();
        if (!enabled) {
          if (rainCtx) rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
          if (rainAnimationFrame) { cancelAnimationFrame(rainAnimationFrame); rainAnimationFrame = null; }
          return;
        }
        if (!rainAnimationFrame) animateRainCanvas();
      }

      function setRainIntensityFromMmPerHour(rainMmPerHour) {
        ensureRainCanvas();
        if (!rainCanvas) return;
        var nextCount = toRainDropCount(rainMmPerHour);
        if (nextCount !== rainDropCount || rainDrops.length === 0) {
          rainDropCount = nextCount;
          seedRainDrops(rainDropCount);
        }
        seedWindParticles();updateWeatherHud();
        updateRainEffectVisibility();
      }

      function resolveRainFillColor(level) {
        var key = String(level || '').trim().toLowerCase();
        if (key === 'severe') return '#dc2626';   // Red   — >15 mm/hr
        if (key === 'heavy')  return '#eab308';   // Yellow — 7.5–15 mm/hr
        if (key === 'moderate') return '#16a34a'; // Green  — 2.5–7.5 mm/hr
        return '#7dd3fc';                          // Light Blue — 0–2.5 mm/hr
      }

      function renderWeatherFillLayer(geojsonData) {
        weatherFillLayer.clearLayers();
        if (!geojsonData || !Boolean(visibility.weatherOverlay)) return;
        L.geoJSON(geojsonData, {
          style: function(feature) {
            var props = (feature && feature.properties) ? feature.properties : {};
            var key = String(props.barangay_name || props.barangayName || '').toLowerCase().replace(/\\s+/g,'');
            var impact = weatherImpactByBarangay[key] || null;
            var level = impact ? String(impact.rainLevel || 'light') : 'light';
            return { color: '#0f172a', weight: 0.8, opacity: 0.45, fill: true, fillColor: resolveRainFillColor(level), fillOpacity: 0.36 };
          },
          interactive: false,
        }).addTo(weatherFillLayer);
      }

      function loadWeatherOverlayData() {
        if (!Boolean(visibility.weatherOverlay)) return;
        var apiBase = data.apiBaseUrl || 'http://localhost:4000/api';
        fetch(apiBase + '/flood-risk/calamba/rain-impact')
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(d) {
            if (!d) return;
            var impacts = Array.isArray(d.barangayImpacts) ? d.barangayImpacts : [];
            var nextLookup = {};
            impacts.forEach(function(item) {
              var key = String(item.barangayName || '').toLowerCase().replace(/\\s+/g,'');
              if (!key) return;
              nextLookup[key] = {
                rainLevel: item.rainLevel,
                rainIntensityMmPerHour: Number(item.rainIntensityMmPerHour) || 0,
                temperatureCelsius: item.temperatureCelsius,
              };
            });
            weatherImpactByBarangay = nextLookup;
            var cityRain = Number(d.cityWeather && d.cityWeather.rainIntensityMmPerHour) || 0;
            var cityWeather=d.cityWeather||{};cityWindSpeedKph=Number(cityWeather.windSpeedKph);if(!Number.isFinite(cityWindSpeedKph))cityWindSpeedKph=8;cityWindDirectionDegrees=Number(cityWeather.windDirectionDegrees);if(!Number.isFinite(cityWindDirectionDegrees))cityWindDirectionDegrees=225;cityThunderstormProbabilityPct=Number(cityWeather.thunderstormProbabilityPct);if(!Number.isFinite(cityThunderstormProbabilityPct))cityThunderstormProbabilityPct=0;
            cityRainIntensityMmPerHour = cityRain;
            setRainIntensityFromMmPerHour(cityRain);
            if (d.barangayOverlay && Array.isArray(d.barangayOverlay.features)) {
              renderWeatherFillLayer({ type: 'FeatureCollection', features: d.barangayOverlay.features });
            }
          })
          .catch(function() { setRainIntensityFromMmPerHour(0); });
      }

      map.on('resize', refreshRainCanvasSize);
      map.on('move', refreshRainCanvasSize);
      var shorelinePolyline = [
        [14.254, 121.217],
        [14.239, 121.218],
        [14.224, 121.219],
        [14.209, 121.218],
        [14.194, 121.215],
        [14.179, 121.212],
        [14.164, 121.208],
        [14.149, 121.204],
      ];
      var waterwaysState = {
        status: 'idle',
        lines: [],
      };

      function toMetersXY(lat, lon) {
        var refLat = 14.206021;
        var x = lon * 111320 * Math.cos(refLat * Math.PI / 180);
        var y = lat * 110540;
        return [x, y];
      }

      function distanceToSegmentMeters(point, a, b) {
        var p = toMetersXY(point[0], point[1]);
        var p1 = toMetersXY(a[0], a[1]);
        var p2 = toMetersXY(b[0], b[1]);

        var dx = p2[0] - p1[0];
        var dy = p2[1] - p1[1];
        if (dx === 0 && dy === 0) {
          var fx = p[0] - p1[0];
          var fy = p[1] - p1[1];
          return Math.sqrt(fx * fx + fy * fy);
        }

        var t = ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / (dx * dx + dy * dy);
        if (t < 0) {
          t = 0;
        }
        if (t > 1) {
          t = 1;
        }

        var cx = p1[0] + t * dx;
        var cy = p1[1] + t * dy;
        var rx = p[0] - cx;
        var ry = p[1] - cy;
        return Math.sqrt(rx * rx + ry * ry);
      }

      function distanceToPolylineMeters(point, polyline) {
        if (!Array.isArray(polyline) || polyline.length < 2) {
          return Number.POSITIVE_INFINITY;
        }

        var best = Number.POSITIVE_INFINITY;
        for (var i = 1; i < polyline.length; i += 1) {
          var segmentDistance = distanceToSegmentMeters(point, polyline[i - 1], polyline[i]);
          if (segmentDistance < best) {
            best = segmentDistance;
          }
        }
        return best;
      }

      function inferTerrainBand(lat, lon) {
        if (lon <= 121.10 && lat <= 14.22) {
          return 'upland';
        }
        if (lon >= 121.16) {
          return 'lowland';
        }
        return 'midland';
      }

      function classifyRiskAt(latlng) {
        var point = [Number(latlng.lat), Number(latlng.lng)];
        var waterDistance = Number.POSITIVE_INFINITY;

        if (Array.isArray(waterwaysState.lines) && waterwaysState.lines.length > 0) {
          waterwaysState.lines.forEach(function(line) {
            var distance = distanceToPolylineMeters(point, line);
            if (distance < waterDistance) {
              waterDistance = distance;
            }
          });
        }

        var shorelineDistance = distanceToPolylineMeters(point, shorelinePolyline);
        var terrainBand = inferTerrainBand(point[0], point[1]);

        var risk = 'LOW';
        if (shorelineDistance <= 350 || waterDistance <= 100 || terrainBand === 'lowland') {
          risk = 'HIGH';
        } else if (waterDistance <= 300 || (shorelineDistance <= 700 && terrainBand !== 'upland') || terrainBand === 'midland') {
          risk = 'MODERATE';
        }

        if (terrainBand === 'upland' && waterDistance > 300 && shorelineDistance > 900) {
          risk = 'LOW';
        }

        return {
          risk: risk,
          waterDistance: Number.isFinite(waterDistance) ? Math.round(waterDistance) : null,
          shorelineDistance: Number.isFinite(shorelineDistance) ? Math.round(shorelineDistance) : null,
          terrainBand: terrainBand,
        };
      }

      function fetchWithTimeout(url, options, timeoutMs) {
        return new Promise(function(resolve, reject) {
          var settled = false;
          var timer = setTimeout(function() {
            if (!settled) {
              settled = true;
              reject(new Error('Timeout'));
            }
          }, timeoutMs);

          fetch(url, options)
            .then(function(response) {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              resolve(response);
            })
            .catch(function(error) {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              reject(error);
            });
        });
      }

      function parseOverpassLines(data) {
        var elements = Array.isArray(data && data.elements) ? data.elements : [];
        return elements
          .map(function(element) {
            if (!Array.isArray(element.geometry)) {
              return null;
            }

            var line = element.geometry
              .map(function(p) { return [Number(p.lat), Number(p.lon)]; })
              .filter(function(p) { return Number.isFinite(p[0]) && Number.isFinite(p[1]); });
            return line.length > 1 ? line : null;
          })
          .filter(Boolean);
      }

      function loadOsmWaterways() {
        if (waterwaysState.status === 'loading' || waterwaysState.status === 'ready') {
          return;
        }

        waterwaysState.status = 'loading';

        var query =
          '[out:json][timeout:20];' +
          '(' +
            'way["waterway"~"river|stream|canal|drain"](${CALAMBA_BOUNDS.latMin},${CALAMBA_BOUNDS.lonMin},${CALAMBA_BOUNDS.latMax},${CALAMBA_BOUNDS.lonMax});' +
          ');' +
          'out geom;';

        var endpoints = [
          'https://overpass-api.de/api/interpreter',
          'https://overpass.kumi.systems/api/interpreter',
          'https://overpass.openstreetmap.fr/api/interpreter',
        ];

        function tryEndpoint(index) {
          if (index >= endpoints.length) {
            waterwaysState.lines = [];
            waterwaysState.status = 'failed';
            return;
          }

          var endpoint = endpoints[index];
          fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: 'data=' + encodeURIComponent(query),
          }, 9000)
            .then(function(response) {
              if (!response.ok) {
                throw new Error('POST failed');
              }
              return response.json();
            })
            .then(function(data) {
              var lines = parseOverpassLines(data);
              if (lines.length === 0) {
                throw new Error('No waterways');
              }
              waterwaysState.lines = lines;
              waterwaysState.status = 'ready';
            })
            .catch(function() {
              fetchWithTimeout(endpoint + '?data=' + encodeURIComponent(query), {
                method: 'GET',
              }, 9000)
                .then(function(response) {
                  if (!response.ok) {
                    throw new Error('GET failed');
                  }
                  return response.json();
                })
                .then(function(data) {
                  var lines = parseOverpassLines(data);
                  if (lines.length === 0) {
                    throw new Error('No waterways');
                  }
                  waterwaysState.lines = lines;
                  waterwaysState.status = 'ready';
                })
                .catch(function() {
                  tryEndpoint(index + 1);
                });
            });
        }

        tryEndpoint(0);
      }

      function renderBoundary() {
        boundaryLayer.clearLayers();
        L.geoJSON(data.boundaryGeoJson, {
          style: function() {
            return {
              color: '#111111',
              weight: 3,
              fillOpacity: 0,
            };
          }
        }).addTo(boundaryLayer);
      }

      function resolveFloodRiskColor(level) {
        var risk = String(level || '').trim().toUpperCase();
        if (risk === 'HIGH') { return '#dc2626'; }
        if (risk === 'MEDIUM' || risk === 'MODERATE') { return '#eab308'; }
        return '#16a34a';
      }

      function renderFloodHazardLayer(geojsonData) {
        floodHazardLayer.clearLayers();
        if (!geojsonData) { return; }
        L.geoJSON(geojsonData, {
          style: function(feature) {
            var props = (feature && feature.properties) ? feature.properties : {};
            var level = props.flood_risk_level || props.base_hazard || 'LOW';
            return {
              color: resolveFloodRiskColor(level),
              weight: 2.5,
              opacity: 0.9,
              fill: true,
              fillColor: resolveFloodRiskColor(level),
              fillOpacity: 0.18,
            };
          },
          interactive: true,
          onEachFeature: function(feature, layer) {
            var props = (feature && feature.properties) ? feature.properties : {};
            var name = props.barangay_name || 'Barangay';
            var level = String(props.flood_risk_level || props.base_hazard || 'LOW').toUpperCase();
            layer.bindPopup(
              '<div class="flood-info">' +
                '<div class="head">FLOOD HAZARD LAYER</div>' +
                '<table>' +
                  '<tr><td>Barangay</td><td>' + name + '</td></tr>' +
                  '<tr><td>Flood Risk</td><td>' + level + '</td></tr>' +
                '</table>' +
              '</div>'
            );
          }
        }).addTo(floodHazardLayer);
      }

      // Fetch barangay boundaries with flood risk from the backend (same source as admin map)
      var barangayGeoJsonData = null;
      function loadBarangayFloodLayer() {
        if (barangayGeoJsonData) {
          renderFloodHazardLayer(barangayGeoJsonData);
          return;
        }
        var apiBase = data.apiBaseUrl || 'http://localhost:4000/api';
        fetch(apiBase + '/flood-risk/calamba/barangays')
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(d) {
            if (d) {
              barangayGeoJsonData = d;
              renderFloodHazardLayer(d);
            }
          })
          .catch(function() {});
      }

      function identifyFloodAt(latlng) {
        if (!inCalamba(latlng.lat, latlng.lng) || !isWithinCalambaBoundary(latlng)) {
          return;
        }

        var result = classifyRiskAt(latlng);
        var sourceLabel = waterwaysState.status === 'ready'
          ? 'OSM waterways + Calamba terrain rules'
          : 'OSM waterways + Calamba terrain rules (terrain fallback active)';

        L.popup({ maxWidth: 320 })
          .setLatLng(latlng)
          .setContent(
            '<div class="flood-info">' +
              '<div class="head">FLOOD INFORMATION</div>' +
              '<table>' +
                '<tr><td>Risk Class</td><td>' + result.risk + '</td></tr>' +
                '<tr><td>Terrain Band</td><td>' + toCapitalWord(result.terrainBand) + '</td></tr>' +
                '<tr><td>Data Source</td><td>' + sourceLabel + '</td></tr>' +
              '</table>' +
            '</div>'
          )
          .openOn(map);
      }

      function setLayerVisible(layer, visible) {
        if (visible) {
          if (!map.hasLayer(layer)) {
            map.addLayer(layer);
          }
          return;
        }

        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }

      function applyLayerVisibility() {
        setLayerVisible(boundaryLayer, Boolean(visibility.boundary));
        setLayerVisible(areaLayer, Boolean(visibility.evacuationAreas));
        setLayerVisible(userLayer, Boolean(visibility.userMarker));
        setLayerVisible(routeLayer, Boolean(visibility.route));
        setLayerVisible(floodHazardLayer, Boolean(visibility.raster));
        setLayerVisible(weatherFillLayer, Boolean(visibility.weatherOverlay));
        updateRainEffectVisibility();
        applyIronMapTint();
        renderLegendControl();
        if (Boolean(visibility.weatherOverlay)) {
          loadWeatherOverlayData();
        }
      }

      var userMarker = L.circleMarker([data.userLocation.latitude, data.userLocation.longitude], {
        radius: 8,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.95
      }).addTo(userLayer).bindPopup('Your location');

      var areaPinIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -22]
      });

      var selectedAreaPinIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -24]
      });

      var fitBounds = L.latLngBounds([[data.userLocation.latitude, data.userLocation.longitude]]);

      if (data.showAreas) {
        data.allAreas.forEach(function(area){
          if (!inCalamba(Number(area.latitude), Number(area.longitude))) {
            return;
          }
          var isSelected = area.id === data.selectedAreaId;
          var marker = L.marker([area.latitude, area.longitude], {
            icon: isSelected ? selectedAreaPinIcon : areaPinIcon
          }).addTo(areaLayer).bindPopup(
            '<strong>' + area.name + '</strong><br/>' +
            'Type: ' + area.placeType + '<br/>' +
            'Location: ' + area.locationText
          );

          marker.on('click', function() {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'select-area',
              areaId: area.id
            }));
          });
          fitBounds.extend([area.latitude, area.longitude]);
        });

        if (Array.isArray(data.routeCoordinates) && data.routeCoordinates.length > 1) {
          var routeLine = L.polyline(
            data.routeCoordinates
              .map(function(point) { return [Number(point.latitude), Number(point.longitude)]; })
              .filter(function(point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]) && inCalamba(point[0], point[1]); }),
            {
              color: '#16a34a',
              weight: 5,
              opacity: 0.9,
            }
          ).addTo(routeLayer);

          var routeBounds = routeLine.getBounds();
          if (routeBounds && routeBounds.isValid()) {
            map.fitBounds(routeBounds.pad(0.12), { maxZoom: 16 });
          } else if (fitBounds.isValid()) {
            map.fitBounds(fitBounds.pad(0.08), { maxZoom: 15 });
          }
        } else if (fitBounds.isValid()) {
          map.fitBounds(fitBounds.pad(0.08), { maxZoom: 15 });
        }

      } else {
        map.setView([data.userLocation.latitude, data.userLocation.longitude], 15);
      }

      loadBarangayFloodLayer();
      loadOsmWaterways();
      renderBoundary();
      weatherFillLayer.addTo(map);
      applyLayerVisibility();
      map.on('click', function(event) {
        if (!visibility.raster) {
          return;
        }
        identifyFloodAt(event.latlng);
      });
      userMarker.openPopup();
    </script>
  </body>
</html>
`;
}

export default function RescueMapScreen() {
  const navigation = useNavigation<any>();
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [requestStarted, setRequestStarted] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<EvacuationArea['id'] | null>(null);
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);
  const [proofImageBase64, setProofImageBase64] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaText, setRouteEtaText] = useState<string | null>(null);
  const [routeSource, setRouteSource] = useState<'osrm' | 'dijkstra' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rescueNotes, setRescueNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationArea[]>(fallbackEvacuationAreas);
  const [recentRescueRecords, setRecentRescueRecords] = useState<RescueRecord[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<UserMapLayerVisibility>({
    boundary: true,
    evacuationAreas: true,
    userMarker: true,
    route: true,
    raster: false,
    weatherOverlay: true,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const recordSyncInFlightRef = useRef(false);

  const loadEvacuationAreas = useCallback(async () => {
    try {
      const areasResult = await api.get('/content/evacuation-areas').then((res) => res.data);
      if (!Array.isArray(areasResult) || areasResult.length === 0) {
        setEvacuationAreas(fallbackEvacuationAreas);
        return fallbackEvacuationAreas;
      }

      const normalized: EvacuationArea[] = areasResult
        .map((item: any, index: number) => {
          const lat = Number(item?.latitude);
          const lon = Number(item?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
          }

          return {
            id: String(item?.id ?? `db-${index + 1}`),
            name: String(item?.name || 'Evacuation Area'),
            barangay: String(item?.barangay || 'Calamba'),
            placeType: String(item?.place_type || item?.placeType || 'Evacuation Site'),
            locationText: String(
              item?.address ||
                `${String(item?.name || 'Evacuation Area')}, Barangay ${String(item?.barangay || 'Calamba')}, Calamba City, Laguna, Philippines`,
            ),
            capacity: Math.max(0, Number(item?.capacity || 0)),
            evacuees: normalizeEvacueesValue(item),
            latitude: lat,
            longitude: lon,
          };
        })
        .filter((item: EvacuationArea | null): item is EvacuationArea => Boolean(item));

      if (normalized.length > 0) {
        setEvacuationAreas(normalized);
        return normalized;
      }

      setEvacuationAreas(fallbackEvacuationAreas);
      return fallbackEvacuationAreas;
    } catch {
      setEvacuationAreas(fallbackEvacuationAreas);
      return fallbackEvacuationAreas;
    }
  }, []);

  const beginRescueRequest = useCallback(async () => {
    if (!userLocation) {
      return;
    }

    setRequestStarted(true);
    const latestAreas = await loadEvacuationAreas();
    const nearestAvailable = findNearestAvailableArea(userLocation, latestAreas);
    if (nearestAvailable) {
      setSelectedAreaId(nearestAvailable.id);
      return;
    }

    setSelectedAreaId(null);
    Alert.alert('No available evacuation area', 'All evacuation areas are currently full. Please try again shortly.');
  }, [loadEvacuationAreas, userLocation]);

  const loadRecentRescueRecords = useCallback(async () => {
    if (recordSyncInFlightRef.current) {
      return;
    }

    recordSyncInFlightRef.current = true;
    try {
      const rows = await api.get('/reports/mine').then((res) => (Array.isArray(res.data) ? res.data : []));
      const rescueRows = rows
        .filter((item: any) => String(item?.report_type || '').toLowerCase() === 'rescue')
        .slice(0, 6)
        .map((item: any) => ({
          id: Number(item.id),
          report_code: item.report_code || null,
          status: normalizeRescueStatus(item.status),
          created_at: item.created_at,
          updated_at: item.updated_at || null,
          latitude: Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null,
          longitude: Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null,
          assigned_team: item.assigned_team || null,
          decline_explanation: item.decline_explanation || null,
        }));

      setRecentRescueRecords(rescueRows);
    } catch {
      setRecentRescueRecords([]);
    } finally {
      recordSyncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      await loadEvacuationAreas();

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        } else {
          setUserLocation({ latitude: 14.2128, longitude: 121.1671 });
        }
      } catch {
        setUserLocation({ latitude: 14.2128, longitude: 121.1671 });
      }

      await loadRecentRescueRecords();

      setLoading(false);
    }

    bootstrap().catch(() => {
      setLoading(false);
    });
  }, [loadEvacuationAreas, loadRecentRescueRecords]);

  useFocusEffect(
    useCallback(() => {
      loadRecentRescueRecords().catch(() => {});
      loadEvacuationAreas().catch(() => {});

      const timer = setInterval(() => {
        loadRecentRescueRecords().catch(() => {});
        loadEvacuationAreas().catch(() => {});
      }, 4000);

      return () => {
        clearInterval(timer);
      };
    }, [loadEvacuationAreas, loadRecentRescueRecords]),
  );

  const selectedArea = useMemo(
    () => evacuationAreas.find((area) => area.id === selectedAreaId) ?? null,
    [evacuationAreas, selectedAreaId],
  );

  function buildFallbackPlan(targetArea?: EvacuationArea) {
    if (!userLocation) {
      return null;
    }

    const { nodes, adj } = buildGraph(userLocation, evacuationAreas);

    if (targetArea) {
      const result = dijkstra(adj, targetArea.id, 'U');
      if (!Number.isFinite(result.distanceKm)) {
        return null;
      }

      const route = result.path
        .map((id) => nodes.get(id))
        .filter((node): node is { id: string; latitude: number; longitude: number } => Boolean(node))
        .map((node) => ({ latitude: node.latitude, longitude: node.longitude }))
        .reverse();

      const etaMinutes = Math.max(3, Math.round((result.distanceKm / 24) * 60));
      return {
        area: targetArea,
        distanceKm: result.distanceKm,
        etaText: formatEtaText(etaMinutes),
        routeCoordinates: route,
        source: 'dijkstra' as const,
      };
    }

    let best: RescueCandidate | null = null;
    for (const area of evacuationAreas.filter((item) => !isAreaFull(item))) {
      const result = dijkstra(adj, area.id, 'U');
      if (!Number.isFinite(result.distanceKm)) {
        continue;
      }
      if (!best || result.distanceKm < best.distanceKm) {
        best = { area, distanceKm: result.distanceKm, path: result.path };
      }
    }

    if (!best) {
      return null;
    }

    const route = best.path
      .map((id) => nodes.get(id))
      .filter((node): node is { id: string; latitude: number; longitude: number } => Boolean(node))
      .map((node) => ({ latitude: node.latitude, longitude: node.longitude }))
      .reverse();
    const etaMinutes = Math.max(3, Math.round((best.distanceKm / 24) * 60));
    return {
      area: best.area,
      distanceKm: best.distanceKm,
      etaText: formatEtaText(etaMinutes),
      routeCoordinates: route,
      source: 'dijkstra' as const,
    };
  }

  useEffect(() => {
    if (!requestStarted || !userLocation || selectedAreaId) {
      return;
    }

    let active = true;
    resolveFastestRoadPlan(userLocation, evacuationAreas)
      .then((plan) => {
        if (!active) {
          return;
        }

        if (plan) {
          setSelectedAreaId(plan.area.id);
          return;
        }

        const fallback = buildFallbackPlan();
        if (fallback) {
          setSelectedAreaId(fallback.area.id);
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }

        const fallback = buildFallbackPlan();
        if (fallback) {
          setSelectedAreaId(fallback.area.id);
        }
      });

    return () => {
      active = false;
    };
  }, [evacuationAreas, requestStarted, selectedAreaId, userLocation]);

  useEffect(() => {
    if (!requestStarted || !userLocation || !selectedArea) {
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaText(null);
      setRouteSource(null);
      return;
    }

    let active = true;

    fetchRoadRoute(userLocation, {
      latitude: selectedArea.latitude,
      longitude: selectedArea.longitude,
    }, true, 3)
      .then((road) => {
        if (!active) {
          return;
        }

        setRouteCoordinates(road.routeCoordinates);
        setRouteDistanceKm(road.distanceKm);
        setRouteEtaText(formatEtaText(road.etaMinutes));
        setRouteSource('osrm');
      })
      .catch(() => {
        if (!active) {
          return;
        }

        const fallback = buildFallbackPlan(selectedArea);
        if (fallback) {
          setRouteCoordinates(fallback.routeCoordinates);
          setRouteDistanceKm(fallback.distanceKm);
          setRouteEtaText(fallback.etaText);
          setRouteSource('dijkstra');
        } else {
          setRouteCoordinates([]);
          setRouteDistanceKm(null);
          setRouteEtaText(null);
          setRouteSource(null);
        }
      });

    return () => {
      active = false;
    };
  }, [evacuationAreas, requestStarted, selectedArea, userLocation]);

  const apiBaseUrl = useMemo(() => String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, ''), []);

  const mapHtml = useMemo(() => {
    if (!userLocation) {
      return null;
    }

    return buildLeafletHtml(
      userLocation,
      evacuationAreas,
      selectedAreaId,
      requestStarted,
      routeCoordinates,
      apiBaseUrl,
      layerVisibility,
    );
  }, [evacuationAreas, layerVisibility, apiBaseUrl, requestStarted, routeCoordinates, selectedAreaId, userLocation]);

  const layerRows: Array<{ key: keyof UserMapLayerVisibility; label: string }> = [
    { key: 'boundary', label: 'Calamba Municipal Boundary' },
    { key: 'evacuationAreas', label: 'Evacuation Area' },
    { key: 'userMarker', label: 'Incident / User Marker' },
    { key: 'route', label: 'Responder Route' },
    { key: 'raster', label: 'Flood Hazard Layer' },
    { key: 'weatherOverlay', label: 'Live Weather Overlay' },
  ];

  async function handleUploadProof() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to upload proof.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setProofImageUri(asset.uri || null);
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        setProofImageBase64(`data:${mimeType};base64,${asset.base64}`);
      } else {
        setProofImageBase64(null);
      }
    }
  }

  function handleMapMessage(data: string) {
    try {
      const payload = JSON.parse(data) as { type?: string; areaId?: string };
      if (payload.type === 'select-area' && payload.areaId) {
        const chosen = evacuationAreas.find((area) => area.id === payload.areaId);
        if (!chosen) {
          return;
        }

        if (isAreaFull(chosen)) {
          const nearestAvailable = userLocation ? findNearestAvailableArea(userLocation, evacuationAreas) : null;
          if (nearestAvailable) {
            setSelectedAreaId(nearestAvailable.id);
            Alert.alert('Area at full capacity', `The selected area is full. You were redirected to ${nearestAvailable.name}.`);
          } else {
            setSelectedAreaId(null);
            Alert.alert('No available evacuation area', 'All evacuation areas are currently full. Please try again shortly.');
          }
          return;
        }

        setSelectedAreaId(payload.areaId);
      }
    } catch {
      // Ignore malformed messages from the map.
    }
  }

  async function handleSubmitRescue() {
    if (!userLocation || !selectedArea || !proofImageUri || !proofImageBase64 || submitting) {
      return;
    }

    const latestAreas = await loadEvacuationAreas();
    const refreshedSelected = latestAreas.find((area) => area.id === selectedArea.id) || selectedArea;

    if (isAreaFull(refreshedSelected)) {
      const nearestAvailable = findNearestAvailableArea(userLocation, latestAreas);
      if (nearestAvailable) {
        setSelectedAreaId(nearestAvailable.id);
        Alert.alert('Area at full capacity', `The selected area is full. You were redirected to ${nearestAvailable.name}.`);
      } else {
        setSelectedAreaId(null);
        Alert.alert('No available evacuation area', 'All evacuation areas are currently full. Please try again shortly.');
      }
      return;
    }

    try {
      setSubmitting(true);
      const locationText = `Lat ${userLocation.latitude.toFixed(6)}, Lng ${userLocation.longitude.toFixed(6)}`;
      const session = await loadSession();
      const token = String(session?.token || '').trim();
      if (!token) {
        Alert.alert('Session expired', 'Please log in again before submitting a rescue request.');
        return;
      }

      // Ensure auth header is present for this submit call.
      setApiAuthorizationToken(token);
      const fullName = `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim() || session?.user?.username || '';
      const contactNumber = session?.user?.contactNumber || '';

      await api.post('/reports', {
        reportType: 'rescue',
        incidentType: 'Request Rescue',
        location: locationText,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        evacuationAreaId: selectedArea.id,
        evacuationAreaName: refreshedSelected.name,
        imageBase64: proofImageBase64,
        fullName,
        contactNumber,
        notes: rescueNotes.trim()
          ? `${rescueNotes.trim()} | Selected evacuation area: ${refreshedSelected.name}.`
          : `Selected evacuation area: ${refreshedSelected.name}.`,
      });

      setRequestStarted(false);
      setSelectedAreaId(null);
      setProofImageUri(null);
      setProofImageBase64(null);
      setRescueNotes('');
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaText(null);
      setRouteSource(null);
      await loadRecentRescueRecords();

      Alert.alert('Request submitted', 'Your rescue request has been submitted with image proof.');
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401
          ? 'Your session has expired. Please log in again, then resubmit your rescue request.'
          : status === 413
            ? 'Uploaded image is too large. Please choose a smaller image and try again.'
            : !err?.response
              ? 'Cannot reach the server right now. Please check your connection and try again.'
              : 'Unable to submit rescue request.');
      Alert.alert('Submit failed', message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !userLocation || !mapHtml) {
    return (
      <View style={st.loadingWrap}>
        <ActivityIndicator size="large" color="#0d3558" />
        <Text style={st.loadingText}>Preparing map...</Text>
      </View>
    );
  }

  function statusLabel(status: RescueRecord['status']) {
    return status;
  }

  return (
    <View style={st.root}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Request Rescue</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Fullscreen map modal */}
        <Modal visible={isMapFullscreen} animationType="fade" statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <PlatformMap style={{ flex: 1 }} html={mapHtml} onMessage={handleMapMessage} />
            {/* Exit fullscreen — bottom-right */}
            <TouchableOpacity
              style={st.fsExitBtn}
              activeOpacity={0.85}
              onPress={() => setIsMapFullscreen(false)}
            >
              <MaterialCommunityIcons name="fullscreen-exit" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </Modal>

        <View style={st.mapContainer}>
          <PlatformMap style={st.map} html={mapHtml} onMessage={handleMapMessage} />
          {/* Fullscreen enter — bottom-right */}
          <TouchableOpacity
            style={st.fsEnterBtn}
            activeOpacity={0.85}
            onPress={() => setIsMapFullscreen(true)}
          >
            <MaterialCommunityIcons name="fullscreen" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={st.layerToggleWrap}>
          <TouchableOpacity
            style={st.layerToggleBtn}
            activeOpacity={0.88}
            onPress={() => setShowLayerPanel((prev) => !prev)}
          >
            <View style={st.layerToggleLeft}>
              <MaterialCommunityIcons name="layers-triple" size={18} color="#ffffff" />
              <Text style={st.layerToggleText}>Map Layers</Text>
            </View>
            <MaterialCommunityIcons name={showLayerPanel ? 'chevron-up' : 'chevron-down'} size={20} color="#ffffff" />
          </TouchableOpacity>

          {showLayerPanel ? (
            <View style={st.layerPanel}>
              {layerRows.map((row) => (
                <View key={row.key} style={st.layerRow}>
                  <Text style={st.layerLabel}>{row.label}</Text>
                  <Switch
                    value={layerVisibility[row.key]}
                    onValueChange={(value) => {
                      setLayerVisibility((prev) => {
                        const next = { ...prev, [row.key]: value };
                        // Mutual exclusion: weather overlay and flood hazard cannot both be on
                        if (row.key === 'weatherOverlay' && value) next.raster = false;
                        if (row.key === 'raster' && value) next.weatherOverlay = false;
                        return next;
                      });
                    }}
                    trackColor={{ false: '#cbd5e1', true: '#22c55e' }}
                    thumbColor="#ffffff"
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {requestStarted ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={st.mapBottomActionsWrap}
          >
            <View style={st.bottomActionRow}>
              <TouchableOpacity style={st.uploadBtn} activeOpacity={0.88} onPress={handleUploadProof}>
                <Text style={st.uploadBtnText}>{proofImageUri ? '✓ Image Uploaded' : 'Upload Image'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  st.submitBtn,
                  !proofImageUri || !proofImageBase64 || !selectedArea || submitting ? st.submitBtnDisabled : null,
                ]}
                activeOpacity={0.88}
                disabled={!proofImageUri || !proofImageBase64 || !selectedArea || submitting}
                onPress={handleSubmitRescue}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.submitBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.notesInput}
              value={rescueNotes}
              onChangeText={setRescueNotes}
              placeholder="Add notes (optional) — describe your situation, number of people, injuries, etc."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={st.areaCountText}>Image proof is required before submitting.</Text>
          </KeyboardAvoidingView>
        ) : null}

        <View style={st.listWrap}>
          <View style={st.areaCard}>
            <MaterialCommunityIcons name="map-marker" size={20} color="#dc2626" style={{ marginTop: 2 }} />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={st.areaName}>Your Current Location</Text>
              <Text style={st.areaAddr}>
                {userLocation.latitude.toFixed(5)}°N, {userLocation.longitude.toFixed(5)}°E
              </Text>
            </View>
          </View>

          <View style={st.actionWrap}>
            <TouchableOpacity
              style={st.actionBtn}
              activeOpacity={0.88}
              onPress={() => {
                if (requestStarted) {
                  setRequestStarted(false);
                  setSelectedAreaId(null);
                  setProofImageUri(null);
                  setProofImageBase64(null);
                  setRescueNotes('');
                  setRouteCoordinates([]);
                  setRouteDistanceKm(null);
                  setRouteEtaText(null);
                  setRouteSource(null);
                  return;
                }

                beginRescueRequest().catch(() => {
                  setRequestStarted(true);
                });
              }}
            >
              <Text style={st.actionText}>{requestStarted ? 'Cancel' : 'Send Rescue Request'}</Text>
            </TouchableOpacity>
          </View>

          {requestStarted ? (
            <>
              <Text style={st.areaSectionTitle}>Evacuation Areas</Text>
              <Text style={st.areaCountText}>Tap a map marker to select an evacuation area.</Text>

              {selectedArea ? (
                <View style={[st.areaCard, st.areaCardSelected]}>
                  <MaterialCommunityIcons name="home-city" size={20} color="#15803d" style={{ marginTop: 2 }} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={st.areaName}>{selectedArea.name}</Text>
                    <Text style={st.areaMetaLabel}>Barangay:</Text>
                    <Text style={st.areaAddr}>{selectedArea.barangay}</Text>
                    <Text style={st.areaMetaLabel}>Place Type:</Text>
                    <Text style={st.areaAddr}>{selectedArea.placeType}</Text>
                    <Text style={st.areaMetaLabel}>Exact Location:</Text>
                    <Text style={st.areaAddr}>{selectedArea.locationText}</Text>
                    <Text style={st.areaMetaLabel}>Capacity:</Text>
                    <Text style={st.areaAddr}>{selectedArea.capacity}</Text>
                    <Text style={st.areaMetaLabel}>Evacuees:</Text>
                    <Text style={st.areaAddr}>{selectedArea.evacuees}</Text>
                    <Text style={st.areaMetaLabel}>Route Distance:</Text>
                    <Text style={st.areaAddr}>{routeDistanceKm ? `${routeDistanceKm.toFixed(2)} km` : 'Calculating...'}</Text>
                    <Text style={st.areaMetaLabel}>ETA:</Text>
                    <Text style={st.areaAddr}>{routeEtaText || 'Calculating...'}</Text>
                    <Text style={st.areaMetaLabel}>Route Type:</Text>
                    <Text style={st.areaAddr}>
                      {routeSource === 'osrm'
                        ? 'Car road route'
                        : routeSource === 'dijkstra'
                          ? 'Fallback shortest path'
                          : 'Calculating...'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={st.areaHintCard}>
                  <Text style={st.areaHintText}>Selecting the nearest evacuation area now. You can tap another map pin if needed.</Text>
                </View>
              )}
            </>
          ) : null}

          <Text style={[st.areaSectionTitle, { marginTop: 10 }]}>Recent Rescue Requests</Text>
          {recentRescueRecords.length === 0 ? (
            <View style={st.areaHintCard}>
              <Text style={st.areaHintText}>No rescue request records yet.</Text>
            </View>
          ) : (
            recentRescueRecords.map((record) => (
              <TouchableOpacity
                key={record.id}
                style={st.areaCard}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('Rescue Status', { reportId: record.id })}
              >
                <MaterialCommunityIcons name="clipboard-list-outline" size={20} color="#0d3558" style={{ marginTop: 2 }} />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={st.areaName}>{record.report_code || `RPT-${String(record.id).padStart(6, '0')}`}</Text>
                  <Text style={st.areaMetaLabel}>Status:</Text>
                  <Text style={st.areaAddr}>{statusLabel(record.status)}</Text>
                  <Text style={st.areaMetaLabel}>Submitted:</Text>
                  <Text style={st.areaAddr}>{new Date(record.created_at).toLocaleString()}</Text>
                  {record.assigned_team ? (
                    <>
                      <Text style={st.areaMetaLabel}>Assigned Team:</Text>
                      <Text style={st.areaAddr}>{record.assigned_team}</Text>
                    </>
                  ) : null}
                  {record.status === 'Declined' && record.decline_explanation ? (
                    <>
                      <Text style={st.areaMetaLabel}>Decline Reason:</Text>
                      <Text style={st.areaAddr}>{record.decline_explanation}</Text>
                    </>
                  ) : null}
                  <Text style={st.areaBestTag}>Tap to open full status tracker</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e5e7eb' },
  loadingWrap: { flex: 1, backgroundColor: '#eef2f7', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#475569', marginTop: 10, fontSize: 13, fontWeight: '600' },

  header: {
    backgroundColor: '#0d3558', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  mapContainer: {
    marginHorizontal: 14, marginTop: 10, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#cbd5e1', height: 360, backgroundColor: '#fff',
  },
  map: { flex: 1 },
  fsEnterBtn: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(15,23,42,0.82)', borderRadius: 8,
    padding: 7, zIndex: 999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 6,
  },
  fsExitBtn: {
    position: 'absolute', bottom: 22, right: 16,
    backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 10,
    padding: 10, zIndex: 9999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 5, elevation: 8,
  },
  layerToggleWrap: {
    marginHorizontal: 14,
    marginTop: 8,
  },
  layerToggleBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0d3558',
    backgroundColor: '#0d3558',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  layerToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  layerToggleText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  layerPanel: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  layerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  layerLabel: { color: '#334155', fontSize: 12, fontWeight: '700' },
  mapBottomActionsWrap: { paddingHorizontal: 14, marginTop: 8 },

  notesInput: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f2948',
    minHeight: 72,
    lineHeight: 19,
  },

  listWrap: { paddingHorizontal: 14, marginTop: 12 },
  areaSectionTitle: { color: '#0f2948', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  areaCountText: { color: '#475569', fontSize: 11, fontWeight: '600', marginBottom: 8 },
  areaCard: {
    backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
    marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  areaCardSelected: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  areaName: { color: '#0f2948', fontSize: 14, fontWeight: '800' },
  areaMetaLabel: { color: '#0f2948', fontSize: 11, marginTop: 5, fontWeight: '700' },
  areaAddr: { color: '#475569', fontSize: 12, marginTop: 2 },
  areaBestTag: { color: '#15803d', fontSize: 11, marginTop: 4, fontWeight: '700' },
  areaHintCard: {
    backgroundColor: '#ecfeff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  areaHintText: { color: '#0f2948', fontSize: 11, fontWeight: '600' },

  actionWrap: { paddingHorizontal: 14, marginTop: 2 },
  actionBtn: {
    backgroundColor: '#0d3558',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  actionText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  bottomActionRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  uploadBtn: {
    flex: 1,
    backgroundColor: '#0369a1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  submitBtn: {
    flex: 1,
    backgroundColor: '#15803d',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  submitBtnDisabled: { backgroundColor: '#94a3b8' },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});


