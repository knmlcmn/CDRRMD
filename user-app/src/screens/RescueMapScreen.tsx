import { submissionErrorNotice, useNoticeModal } from '../components/useNoticeModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';
import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import PlatformMap from '../components/PlatformMap';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { api, setApiAuthorizationToken } from '../services/api';
import { fetchBestRoadRoute, fetchRoadRoute } from '../services/routingService';
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
  status: 'available' | 'full';
  latitude: number;
  longitude: number;
};
type RescuePlan = {
  area: EvacuationArea;
  distanceKm: number;
  etaMinutes: number;
  etaText: string;
  routeCoordinates: Coordinate[];
  source: 'osrm';
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
  floodHazard: boolean;
  evacuationAreas: boolean;
  userMarker: boolean;
  route: boolean;
  rainOverlay: boolean;
  temperatureOverlay: boolean;
  humidityOverlay: boolean;
  windOverlay: boolean;
};

type Props = {
  testModeEnabled?: boolean;
};

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
  const currentAndIncoming = Number(item?.evacuees);
  if (Number.isFinite(currentAndIncoming)) {
    return Math.max(0, currentAndIncoming);
  }

  const fallback = Number(item?.rescued_evacuees);
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

function hasCapacityFor(area: EvacuationArea, peopleCount: number) {
  return area.status !== 'full' && area.capacity - area.evacuees >= peopleCount;
}

function isAreaFull(area: EvacuationArea) {
  return !hasCapacityFor(area, 1);
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

function formatEtaText(etaMinutes: number) {
  return `${Math.max(etaMinutes - 1, 1)} - ${etaMinutes + 3} mins`;
}

async function resolveBestRoadPlan(
  userLocation: Coordinate,
  evacuationAreas: EvacuationArea[],
  peopleCount = 1,
): Promise<RescuePlan | null> {
  const availableAreas = evacuationAreas.filter((area) => hasCapacityFor(area, peopleCount));
  const bestRoute = await fetchBestRoadRoute(
    userLocation,
    availableAreas.map((area) => ({
      id: area.id,
      latitude: area.latitude,
      longitude: area.longitude,
    })),
    3,
  );
  if (!bestRoute) {
    return null;
  }

  const area = availableAreas.find((candidate) => candidate.id === bestRoute.destinationId);
  if (!area) {
    return null;
  }

  return {
    area,
    distanceKm: bestRoute.distanceKm,
    etaMinutes: bestRoute.etaMinutes,
    etaText: formatEtaText(bestRoute.etaMinutes),
    routeCoordinates: bestRoute.routeCoordinates,
    source: 'osrm',
  };
}

function buildLeafletHtml(
  userLocation: Coordinate,
  allAreas: EvacuationArea[],
  selectedAreaId: EvacuationArea['id'] | null,
  showAreas: boolean,
  routeCoordinates: Coordinate[],
  apiBaseUrl: string,
  layerVisibility: UserMapLayerVisibility,
  showForecastTimeline: boolean,
) {
  const serialized = JSON.stringify({
    userLocation,
    allAreas,
    selectedAreaId,
    showAreas,
    routeCoordinates,
    windDataUrl: `${apiBaseUrl}/weather/wind-field`,
    rainImpactUrl: `${apiBaseUrl}/flood-risk/calamba/rain-impact`,
    floodHazardUrl: `${apiBaseUrl}/flood-risk/calamba/barangays`,
    layerVisibility,
    showForecastTimeline,
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
      .layer-control{font-family:Arial,sans-serif;position:relative}.layer-control-button{background:rgba(15,23,42,.9);border:1px solid rgba(148,163,184,.45);border-radius:8px;color:#fff;cursor:pointer;font:700 11px/1 Arial,sans-serif;padding:8px 10px}.layer-control-panel{background:rgba(13,20,35,.96);border:1px solid rgba(148,163,184,.25);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.6);display:none;margin-top:6px;padding:10px 10px 8px;width:190px}.layer-control-panel.open{display:block}.layer-control-title{border-bottom:1px solid rgba(148,163,184,.2);color:#94a3b8;font-size:9px;font-weight:700;letter-spacing:.1em;margin-bottom:7px;padding-bottom:5px;text-align:center;text-transform:uppercase}.layer-control-row{align-items:center;color:#e2e8f0;display:flex;font-size:10px;font-weight:700;justify-content:space-between;padding:5px 0}.layer-control-row input{accent-color:#38bdf8}
      .flood-info{font:13px/1.35 Arial,sans-serif;min-width:220px}
      .flood-info .head{background:#0891b2;color:#fff;font-weight:800;margin:-10px -12px 10px;padding:10px 12px}
      .flood-info table{border-collapse:collapse;width:100%}
      .flood-info td{border:1px solid #cbd5e1;padding:6px 8px}
      .flood-info td:first-child{background:#f8fafc;font-weight:700;width:42%}
      .evacuation-popup .leaflet-popup-content{margin:10px 16px 12px;width:min(260px,calc(100vw - 64px))!important}
      .evac-info{font:14px/1.3 Arial,sans-serif;min-width:0;width:100%}
      .evac-info .head{background:#0f766e;color:#fff;font-size:15px;font-weight:800;line-height:1.2;margin:-10px -16px 8px;padding:8px 10px}
      .evac-info .selected{color:#ccfbf1;display:block;font-size:11px;font-weight:700;letter-spacing:.02em;margin-top:2px;text-transform:uppercase}
      .evac-info table{border-collapse:collapse;width:100%}
      .evac-info td{border:1px solid #cbd5e1;padding:5px 7px;vertical-align:top}
      .evac-info td:first-child{background:#f8fafc;font-weight:700;width:36%}
      .evac-status{border-radius:999px;display:inline-block;font-size:12px;font-weight:800;padding:2px 7px}
      .evac-status.available{background:#dcfce7;color:#166534}
      .evac-status.full{background:#fee2e2;color:#991b1b}
      .map-rain-canvas{left:0;opacity:.5;pointer-events:none;position:absolute;top:0;z-index:429}.map-wind-canvas{left:0;opacity:.5;pointer-events:none;position:absolute;top:0;z-index:430}.forecast-timebar{backdrop-filter:blur(9px);background:rgba(7,17,24,.94);border:1px solid rgba(148,163,184,.35);border-radius:18px;bottom:10px;box-shadow:0 5px 18px rgba(0,0,0,.38);color:#fff;display:none;left:50%;max-width:calc(100% - 16px);padding:8px 10px 7px;pointer-events:auto;position:absolute;transform:translateX(-50%);width:calc(100% - 16px);z-index:700}.forecast-time-track{position:relative}.forecast-time-labels{display:flex;justify-content:space-between;margin:0 5px 3px}.forecast-time-label{color:#f8fafc;font:700 10px/1.1 Arial,sans-serif;text-align:center}.forecast-time-date{color:#cbd5e1;display:block;font:8px/1 Arial,sans-serif}.forecast-time-range{appearance:none;background:repeating-linear-gradient(90deg,rgba(203,213,225,.7) 0 1px,transparent 1px 9px);border:0;display:block;height:26px;margin:0;outline:none;width:100%}.forecast-time-range::-webkit-slider-thumb{appearance:none;background:#f97316;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px rgba(249,115,22,.3);cursor:grab;height:17px;width:5px}.forecast-time-range::-moz-range-thumb{background:#f97316;border:2px solid #fff;border-radius:50%;cursor:grab;height:17px;width:5px}.forecast-time-summary{color:#dbeafe;font:700 9px/1.3 Arial,sans-serif;overflow:hidden;text-align:center;text-overflow:ellipsis;white-space:nowrap}
      @media (max-width:420px){.forecast-timebar{bottom:6px;padding:6px 7px}.forecast-time-label{font-size:9px}.forecast-time-date{font-size:7px}.leaflet-control-zoom a{height:28px!important;line-height:28px!important;width:28px!important}}
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
        floodHazard: false,
        rainOverlay: true,
        temperatureOverlay: false,
        humidityOverlay: false,
        windOverlay: true
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

      var cdrrmdIcon = L.divIcon({
        className: '',
        html: '<div style="align-items:center;background:#16a34a;border:3px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 3px 9px rgba(0,0,0,.45);display:flex;height:25px;justify-content:center;transform:rotate(-45deg);width:25px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-landmark.svg" style="filter:brightness(0) invert(1);height:15px;transform:rotate(45deg);width:15px" /></div>',
        iconSize: [31, 31],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28]
      });
      L.marker([14.194052, 121.159688], { icon: cdrrmdIcon, zIndexOffset: 1200 })
        .addTo(map)
        .bindTooltip('CDRRMD - Calamba City Hall', { direction: 'top', offset: [0, -25] })
        .bindPopup('<strong>CDRRMD</strong><br>Calamba City Hall<br>14.194052, 121.159688');

      function applyIronMapTint() {
        var tilePane = map.getPanes().tilePane;
        if (tilePane) {
          tilePane.style.filter = Boolean(visibility.windOverlay) || isScalarWeatherVisible()
            ? 'grayscale(0.28) brightness(0.94) contrast(0.98)'
            : '';
        }
      }

      var legendVisible = false;
      var legendControl = null;
      var legendToggleControl = null;
      var weatherTimelineData = null;
      var weatherTimeframe = 'hour_0';
      var forecastTimebar = null;

      function isScalarWeatherVisible() {
        return Boolean(visibility.rainOverlay) || Boolean(visibility.temperatureOverlay) || Boolean(visibility.humidityOverlay);
      }

      function activeScalarMetric() {
        if (Boolean(visibility.temperatureOverlay)) return 'temperature';
        if (Boolean(visibility.humidityOverlay)) return 'humidity';
        return 'rain';
      }

      function buildLegendHtml() {
        var weatherOn = Boolean(visibility.windOverlay);
        var rainOn = isScalarWeatherVisible();
        var floodOn = Boolean(visibility.floodHazard);

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

        var windSection = '';
        if (weatherOn) {
          windSection =
            '<div class="legend-section-label" style="margin-top:' + (floodOn ? '6px' : '0') + '">' +
              '<span class="legend-section-dot" style="background:#0ea5e9;"></span>' +
              'Wind Layer' +
            '</div>' +
            '<div class="row"><span class="swatch" style="background:linear-gradient(90deg,#526fd0,#29d287,#efa447,#8b49b5);"></span>Wind speed</div>' +
            '<div class="row"><span class="line" style="border-top-color:#ffffff;"></span>Wind direction</div>';
        }

        var rainSection = '';
        if (rainOn) {
          if (Boolean(visibility.temperatureOverlay)) {
            rainSection = '<div class="legend-section-label"><span class="legend-section-dot" style="background:#fb7185;"></span>Temperature (\u00b0C)</div><div style="height:10px;border-radius:999px;margin:6px 0 3px;background:linear-gradient(90deg,#313695,#4575b4,#74add1,#fee090,#f46d43,#a50026);"></div><div style="display:flex;justify-content:space-between;font-size:9px;"><span>16</span><span>22</span><span>26</span><span>30</span><span>34</span><span>40</span></div>';
          } else if (Boolean(visibility.humidityOverlay)) {
            rainSection = '<div class="legend-section-label"><span class="legend-section-dot" style="background:#38bdf8;"></span>Relative humidity (%)</div><div style="height:10px;border-radius:999px;margin:6px 0 3px;background:linear-gradient(90deg,#78350f,#f59e0b,#facc15,#22d3ee,#2563eb,#312e81);"></div><div style="display:flex;justify-content:space-between;font-size:9px;"><span>0</span><span>30</span><span>50</span><span>70</span><span>85</span><span>100</span></div>';
          } else {
            rainSection =
            '<div class="legend-section-label" style="margin-top:' + ((floodOn || weatherOn) ? '6px' : '0') + '">' +
              '<span class="legend-section-dot" style="background:#22d3ee;"></span>' +
              'Rain Accumulation' +
            '</div>' +
            '<div class="row"><span class="swatch" style="background:#4b56be;"></span>Light</div>' +
            '<div class="row"><span class="swatch" style="background:#29ee8f;"></span>Moderate</div>' +
            '<div class="row"><span class="swatch" style="background:#ff7514;"></span>Heavy</div>';
          }
        }

        var noLayers = !floodOn && !weatherOn && !rainOn;
        return (
          '<div class="map-legend">' +
            '<div class="title">Map Legend</div>' +
            (noLayers
              ? '<div style="color:#64748b;font-size:10px;margin-top:4px;">Enable Flood Hazard or Wind Layer to see map indicators.</div>'
              : (floodSection + windSection + rainSection)
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

      function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
        });
      }

      var boundaryLayer = L.layerGroup();
      var floodHazardLayer = L.layerGroup();
      var areaLayer = L.layerGroup();
      var userLayer = L.layerGroup();
      var routeLayer = L.layerGroup();

      var cityWindSpeedKph=8,cityWindDirectionDegrees=225;
      var windCanvas = null;
      var windCtx = null;
      var windAnimationFrame = null;
      var windParticles=[],weatherFrameTick=0;
      var rainCanvas = null;
      var rainCtx = null;
      var rainAmountMm = 0;
      var windBackgroundCanvas = null;

      var rainColorStops = [
        { value: 0, color: [62, 62, 62, 0] },
        { value: 0.2, color: [75, 86, 190, 105] },
        { value: 2, color: [44, 105, 229, 175] },
        { value: 10, color: [16, 198, 244, 210] },
        { value: 25, color: [41, 238, 143, 225] },
        { value: 55, color: [175, 247, 56, 228] },
        { value: 100, color: [255, 214, 42, 232] },
        { value: 180, color: [255, 117, 20, 238] },
        { value: 300, color: [196, 25, 12, 242] },
      ];
      var temperatureColorStops = [
        { value: 16, color: [49, 54, 149, 220] }, { value: 22, color: [69, 117, 180, 224] },
        { value: 26, color: [116, 173, 209, 228] }, { value: 30, color: [254, 224, 144, 232] },
        { value: 34, color: [244, 109, 67, 236] }, { value: 40, color: [165, 0, 38, 242] },
      ];
      var humidityColorStops = [
        { value: 0, color: [120, 53, 15, 218] }, { value: 30, color: [245, 158, 11, 224] },
        { value: 50, color: [250, 204, 21, 226] }, { value: 70, color: [34, 211, 238, 232] },
        { value: 85, color: [37, 99, 235, 236] }, { value: 100, color: [49, 46, 129, 242] },
      ];

      function interpolateColorStops(value, stops) {
        var amount = Number(value);
        if (!Number.isFinite(amount)) return [0, 0, 0, 0];
        if (amount <= stops[0].value) return stops[0].color.slice();
        for (var i = 1; i < stops.length; i += 1) {
          var left = stops[i - 1], right = stops[i];
          if (amount <= right.value) {
            var mix = (amount - left.value) / Math.max(0.0001, right.value - left.value);
            return left.color.map(function(channel, index) { return Math.round(channel + (right.color[index] - channel) * Math.max(0, Math.min(1, mix))); });
          }
        }
        return stops[stops.length - 1].color.slice();
      }

      function scalarColor(value) {
        var metric = activeScalarMetric();
        if (metric !== 'rain' && !Number.isFinite(Number(value))) return [0, 0, 0, 0];
        if (metric === 'temperature') return interpolateColorStops(value, temperatureColorStops);
        if (metric === 'humidity') return interpolateColorStops(value, humidityColorStops);
        return interpolateRainColor(value);
      }

      function pointScalarValue(point) {
        var metric = activeScalarMetric();
        if (metric === 'temperature') return Number(point && point.temperatureCelsius);
        if (metric === 'humidity') return Number(point && point.relativeHumidityPct);
        return Math.max(0, Number(point && point.rainAmountMm) || 0);
      }

      function interpolateRainColor(value) {
        var amount = Math.max(0, Number(value) || 0);
        for (var i = 1; i < rainColorStops.length; i += 1) {
          var left = rainColorStops[i - 1];
          var right = rainColorStops[i];
          if (amount <= right.value) {
            var mix = (amount - left.value) / Math.max(0.0001, right.value - left.value);
            return left.color.map(function(channel, index) {
              return Math.round(channel + (right.color[index] - channel) * Math.max(0, Math.min(1, mix)));
            });
          }
        }
        return rainColorStops[rainColorStops.length - 1].color.slice();
      }

      function activeForecastFrame() {
        return weatherTimelineData && weatherTimelineData.frames ? weatherTimelineData.frames[weatherTimeframe] : null;
      }

      function rainAmountAt(lat, lon) {
        var frame = activeForecastFrame();
        if (!frame || !Array.isArray(frame.points) || frame.points.length === 0) return activeScalarMetric() === 'rain' ? rainAmountMm : NaN;
        var bounds = frame.bounds || {};
        var rows = Math.max(2, Number(frame.rows) || 2);
        var cols = Math.max(2, Number(frame.cols) || 2);
        var latSpan = Math.max(0.000001, Number(bounds.latMax) - Number(bounds.latMin));
        var lonSpan = Math.max(0.000001, Number(bounds.lonMax) - Number(bounds.lonMin));
        var rowFloat = Math.max(0, Math.min(rows - 1, ((Number(bounds.latMax) - lat) / latSpan) * (rows - 1)));
        var colFloat = Math.max(0, Math.min(cols - 1, ((lon - Number(bounds.lonMin)) / lonSpan) * (cols - 1)));
        var row0 = Math.floor(rowFloat), row1 = Math.min(rows - 1, row0 + 1);
        var col0 = Math.floor(colFloat), col1 = Math.min(cols - 1, col0 + 1);
        var rowMix = rowFloat - row0, colMix = colFloat - col0;
        function at(row, col) { return pointScalarValue(frame.points[row * cols + col]); }
        var top = at(row0, col0) + (at(row0, col1) - at(row0, col0)) * colMix;
        var bottom = at(row1, col0) + (at(row1, col1) - at(row1, col0)) * colMix;
        return top + (bottom - top) * rowMix;
      }

      function renderRainAccumulationSurface() {
        if (!rainCtx || !rainCanvas) return;
        rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
        if (!isScalarWeatherVisible()) return;
        var scale = 4;
        var width = Math.max(1, Math.ceil(rainCanvas.width / scale));
        var height = Math.max(1, Math.ceil(rainCanvas.height / scale));
        var fieldCanvas = document.createElement('canvas');
        fieldCanvas.width = width; fieldCanvas.height = height;
        var fieldCtx = fieldCanvas.getContext('2d');
        if (!fieldCtx) return;
        var pixels = fieldCtx.createImageData(width, height);
        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            var latlng = map.containerPointToLatLng([x * scale, y * scale]);
            var color = scalarColor(rainAmountAt(latlng.lat, latlng.lng));
            var offset = (y * width + x) * 4;
            pixels.data[offset] = color[0]; pixels.data[offset + 1] = color[1]; pixels.data[offset + 2] = color[2]; pixels.data[offset + 3] = color[3];
          }
        }
        fieldCtx.putImageData(pixels, 0, 0);
        rainCtx.save();
        clipCanvasToCalamba(rainCtx);
        rainCtx.imageSmoothingEnabled = true;
        rainCtx.filter = 'blur(3px) saturate(1.12)';
        rainCtx.drawImage(fieldCanvas, 0, 0, rainCanvas.width, rainCanvas.height);
        rainCtx.filter = 'none';
        rainCtx.restore();
      }

      function ensureWindCanvas() {
        if (windCanvas) return;
        var pane = map.getPanes && map.getPanes().overlayPane;
        if (!pane) return;
        windCanvas = document.createElement('canvas');
        windCanvas.className = 'map-wind-canvas';
        pane.appendChild(windCanvas);
        windCtx = windCanvas.getContext('2d');
        refreshWindCanvasSize();
      }

      function refreshWindCanvasSize() {
        if (!windCanvas) return;
        var size = map.getSize();
        windCanvas.width = Math.max(1, Number(size.x) || 1);
        windCanvas.height = Math.max(1, Number(size.y) || 1);
        L.DomUtil.setPosition(windCanvas, map.containerPointToLayerPoint([0, 0]));
        renderWindBackground();
        seedWindParticles();
      }

      function seedWindParticles() {
        if (!windCanvas) return;
        var count = Math.round(110 + Math.min(230, Math.max(0, cityWindSpeedKph) * 3));
        windParticles = [];
        for (var i = 0; i < count; i += 1) {
          windParticles.push({ x: Math.random() * windCanvas.width, y: Math.random() * windCanvas.height, age: Math.random() * 140, life: 65 + Math.random() * 120, length: 7 + Math.random() * 18, alpha: .16 + Math.random() * .42, phase: Math.random() * Math.PI * 2 });
        }
      }

      function updateForecastTimebar(){
        if(!forecastTimebar)return;
        forecastTimebar.style.display=Boolean(data.showForecastTimeline)&&(Boolean(visibility.windOverlay)||isScalarWeatherVisible())?'block':'none';
        var frame=activeForecastFrame();
        var range=forecastTimebar.querySelector('.forecast-time-range');
        if(range)range.value=String(Number(String(weatherTimeframe).slice(5))||0);
        forecastTimebar.querySelectorAll('.forecast-time-label').forEach(function(label){var dayOffset=Number(label.dataset.dayOffset||0);var dayFrame=weatherTimelineData&&weatherTimelineData.frames?weatherTimelineData.frames['hour_'+(dayOffset*24)]:null;label.innerHTML=dayFrame?String(dayFrame.label)+'<span class="forecast-time-date">'+String(dayFrame.dateLabel)+'</span>':'Day '+(dayOffset+1);});
        var summary=forecastTimebar.querySelector('.forecast-time-summary');
        if(summary)summary.textContent=!frame?'Loading Open-Meteo forecast...':Boolean(visibility.temperatureOverlay)?String(frame.label)+' '+String(frame.dateLabel||'')+' '+String(frame.hourLabel||'')+' - Temperature '+Number(frame.averageTemperatureCelsius||0).toFixed(1)+'\u00b0C':Boolean(visibility.humidityOverlay)?String(frame.label)+' '+String(frame.dateLabel||'')+' '+String(frame.hourLabel||'')+' - Relative humidity '+Number(frame.averageRelativeHumidityPct||0).toFixed(0)+'%':Boolean(visibility.rainOverlay)?String(frame.label)+' '+String(frame.dateLabel||'')+' '+String(frame.hourLabel||'')+' - Rain '+Number(frame.averageRainAmountMm||0).toFixed(1)+' mm':String(frame.label)+' '+String(frame.dateLabel||'')+' '+String(frame.hourLabel||'')+' - Wind '+Number(frame.averageSpeedKph||0).toFixed(0)+' km/h';
      }
      function applyWeatherTimeframe(key){var frame=weatherTimelineData&&weatherTimelineData.frames?weatherTimelineData.frames[key]:null;if(!frame)return;weatherTimeframe=key;var point=frame.points&&frame.points[0];if(point){rainAmountMm=Number(point.rainAmountMm)||0;cityWindSpeedKph=Number(point.speedKph)||0;cityWindDirectionDegrees=Number(point.directionDegrees)||225;seedWindParticles();}updateForecastTimebar();updateRainEffectVisibility();updateWindEffectVisibility();}
      function ensureForecastTimebar(){
        if(forecastTimebar)return;
        forecastTimebar=document.createElement('div');forecastTimebar.className='forecast-timebar';
        var track=document.createElement('div');track.className='forecast-time-track';
        var labels=document.createElement('div');labels.className='forecast-time-labels';
        for(var dayOffset=0;dayOffset<7;dayOffset+=1){var label=document.createElement('div');label.className='forecast-time-label';label.dataset.dayOffset=String(dayOffset);labels.appendChild(label);}
        var range=document.createElement('input');range.type='range';range.className='forecast-time-range';range.min='0';range.max='167';range.step='1';range.value='0';range.addEventListener('input',function(event){event.stopPropagation();applyWeatherTimeframe('hour_'+event.target.value);});
        track.appendChild(labels);track.appendChild(range);forecastTimebar.appendChild(track);var summary=document.createElement('div');summary.className='forecast-time-summary';forecastTimebar.appendChild(summary);map.getContainer().appendChild(forecastTimebar);updateForecastTimebar();
      }
      function loadWeatherTimeline(){
        if(!data.windDataUrl)return;
        fetch(data.windDataUrl).then(function(response){return response.ok?response.json():null;}).then(function(weather){if(!weather||!weather.frames)return;weatherTimelineData=weather;ensureForecastTimebar();applyWeatherTimeframe('hour_0');}).catch(function(){});
      }

      function ensureRainCanvas(){
        if(rainCanvas)return;
        var pane=map.getPanes&&map.getPanes().overlayPane;
        if(!pane)return;
        rainCanvas=document.createElement('canvas');rainCanvas.className='map-rain-canvas';pane.appendChild(rainCanvas);rainCtx=rainCanvas.getContext('2d');refreshRainCanvasSize();
      }
      function refreshRainCanvasSize(){if(!rainCanvas)return;var size=map.getSize();rainCanvas.width=Math.max(1,Number(size.x)||1);rainCanvas.height=Math.max(1,Number(size.y)||1);L.DomUtil.setPosition(rainCanvas,map.containerPointToLayerPoint([0,0]));renderRainAccumulationSurface();}
      function updateRainEffectVisibility(){ensureRainCanvas();if(!rainCanvas)return;var enabled=isScalarWeatherVisible();rainCanvas.style.display=enabled?'block':'none';if(!enabled){if(rainCtx)rainCtx.clearRect(0,0,rainCanvas.width,rainCanvas.height);return;}renderRainAccumulationSurface();}
      function loadRainImpact(){
        if(!data.rainImpactUrl)return;
        fetch(data.rainImpactUrl).then(function(response){return response.ok?response.json():null;}).then(function(payload){var weather=payload&&payload.cityWeather?payload.cityWeather:{};var amount=Number(weather.rainIntensityMmPerHour);if(Number.isFinite(amount)&&!weatherTimelineData){rainAmountMm=amount;updateRainEffectVisibility();}}).catch(function(){});
      }
      var windColorStops = [
        { value: 0, color: [82, 111, 208, 218] }, { value: 5, color: [45, 174, 224, 224] },
        { value: 10, color: [41, 210, 135, 228] }, { value: 20, color: [155, 209, 79, 232] },
        { value: 30, color: [239, 164, 71, 236] }, { value: 40, color: [211, 72, 145, 240] },
        { value: 60, color: [139, 73, 181, 242] },
      ];

      function interpolateWindColor(value) {
        var speed = Math.max(0, Number(value) || 0);
        for (var i = 1; i < windColorStops.length; i += 1) {
          var left = windColorStops[i - 1], right = windColorStops[i];
          if (speed <= right.value) {
            var mix = (speed - left.value) / Math.max(0.0001, right.value - left.value);
            return left.color.map(function(channel, index) { return Math.round(channel + (right.color[index] - channel) * Math.max(0, Math.min(1, mix))); });
          }
        }
        return windColorStops[windColorStops.length - 1].color.slice();
      }

      function windVectorAt(lat, lon) {
        var frame = activeForecastFrame();
        if (!frame || !Array.isArray(frame.points) || frame.points.length === 0) return null;
        var bounds = frame.bounds || {}, rows = Math.max(2, Number(frame.rows) || 2), cols = Math.max(2, Number(frame.cols) || 2);
        var latSpan = Math.max(0.000001, Number(bounds.latMax) - Number(bounds.latMin));
        var lonSpan = Math.max(0.000001, Number(bounds.lonMax) - Number(bounds.lonMin));
        var rowFloat = Math.max(0, Math.min(rows - 1, ((Number(bounds.latMax) - lat) / latSpan) * (rows - 1)));
        var colFloat = Math.max(0, Math.min(cols - 1, ((lon - Number(bounds.lonMin)) / lonSpan) * (cols - 1)));
        var row0 = Math.floor(rowFloat), row1 = Math.min(rows - 1, row0 + 1), col0 = Math.floor(colFloat), col1 = Math.min(cols - 1, Math.floor(colFloat) + 1);
        var rowMix = rowFloat - row0, colMix = colFloat - col0;
        function at(row, col) { return frame.points[row * cols + col] || { u: 0, v: 0 }; }
        var topLeft = at(row0, col0), topRight = at(row0, col1), bottomLeft = at(row1, col0), bottomRight = at(row1, col1);
        var topU = Number(topLeft.u) + (Number(topRight.u) - Number(topLeft.u)) * colMix;
        var topV = Number(topLeft.v) + (Number(topRight.v) - Number(topLeft.v)) * colMix;
        var bottomU = Number(bottomLeft.u) + (Number(bottomRight.u) - Number(bottomLeft.u)) * colMix;
        var bottomV = Number(bottomLeft.v) + (Number(bottomRight.v) - Number(bottomLeft.v)) * colMix;
        var u = topU + (bottomU - topU) * rowMix, v = topV + (bottomV - topV) * rowMix;
        return { u: u, v: v, speedKph: Math.sqrt(u * u + v * v) * 3.6 };
      }

      function clipCanvasToCalamba(context) {
        var ring = data.boundaryGeoJson && data.boundaryGeoJson.features && data.boundaryGeoJson.features[0] && data.boundaryGeoJson.features[0].geometry && data.boundaryGeoJson.features[0].geometry.coordinates ? data.boundaryGeoJson.features[0].geometry.coordinates[0] : null;
        if (!Array.isArray(ring) || ring.length < 4) return false;
        context.beginPath();
        ring.forEach(function(coord, index) { var point = map.latLngToContainerPoint([Number(coord[1]), Number(coord[0])]); if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); });
        context.closePath(); context.clip(); return true;
      }

      function renderWindBackground() {
        if (!windCanvas || !windCtx || !activeForecastFrame()) return;
        var scale = 4, width = Math.max(1, Math.ceil(windCanvas.width / scale)), height = Math.max(1, Math.ceil(windCanvas.height / scale));
        windBackgroundCanvas = document.createElement('canvas'); windBackgroundCanvas.width = windCanvas.width; windBackgroundCanvas.height = windCanvas.height;
        var lowCanvas = document.createElement('canvas'); lowCanvas.width = width; lowCanvas.height = height;
        var lowCtx = lowCanvas.getContext('2d'), backgroundCtx = windBackgroundCanvas.getContext('2d'); if (!lowCtx || !backgroundCtx) return;
        var pixels = lowCtx.createImageData(width, height);
        for (var y = 0; y < height; y += 1) for (var x = 0; x < width; x += 1) {
          var latlng = map.containerPointToLatLng([x * scale, y * scale]), vector = windVectorAt(latlng.lat, latlng.lng) || { speedKph: 0 }, color = interpolateWindColor(vector.speedKph), offset = (y * width + x) * 4;
          pixels.data[offset] = color[0]; pixels.data[offset + 1] = color[1]; pixels.data[offset + 2] = color[2]; pixels.data[offset + 3] = color[3];
        }
        lowCtx.putImageData(pixels, 0, 0); backgroundCtx.save(); clipCanvasToCalamba(backgroundCtx); backgroundCtx.imageSmoothingEnabled = true; backgroundCtx.drawImage(lowCanvas, 0, 0, windCanvas.width, windCanvas.height); backgroundCtx.restore();
      }

      function animateWindCanvas() {
        if (!windCtx || !windCanvas || !Boolean(visibility.windOverlay) || !activeForecastFrame()) { windAnimationFrame = null; return; }
        windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);
        if (windBackgroundCanvas) windCtx.drawImage(windBackgroundCanvas, 0, 0);
        windCtx.save();
        clipCanvasToCalamba(windCtx);
        weatherFrameTick += 1;
        for (var w=0; w<windParticles.length; w+=1) {
          var particle=windParticles[w], latlng=map.containerPointToLatLng([particle.x,particle.y]), vector=windVectorAt(latlng.lat,latlng.lng);
          if (!vector || !isWithinCalambaBoundary(latlng) || particle.age >= particle.life) { particle.x=Math.random()*windCanvas.width; particle.y=Math.random()*windCanvas.height; particle.age=0; continue; }
          var motionScale=.42+Math.min(1.5,vector.speedKph/28), vx=vector.u*motionScale, vy=-vector.v*motionScale, tailScale=6+Math.min(9,vector.speedKph/2.8), ageFade=Math.min(1,particle.age/8)*Math.min(1,(particle.life-particle.age)/12);
          windCtx.strokeStyle='rgba(255,255,255,'+(.52+ageFade*.42)+')'; windCtx.lineWidth=vector.speedKph>=35?1.7:1.25; windCtx.beginPath(); windCtx.moveTo(particle.x-vx*tailScale,particle.y-vy*tailScale); windCtx.lineTo(particle.x,particle.y); windCtx.stroke(); particle.x+=vx; particle.y+=vy; particle.age+=1;
        }
        windCtx.restore();
        windAnimationFrame = requestAnimationFrame(animateWindCanvas);
      }

      function updateWindEffectVisibility() {
        ensureWindCanvas();
        if (!windCanvas) return;
        var enabled=Boolean(visibility.windOverlay);
        windCanvas.style.display=enabled?'block':'none';
        if (!enabled) { if (windCtx) windCtx.clearRect(0,0,windCanvas.width,windCanvas.height); if (windAnimationFrame) { cancelAnimationFrame(windAnimationFrame); windAnimationFrame=null; } return; }
        renderWindBackground();
        seedWindParticles();
        if (!windAnimationFrame) animateWindCanvas();
      }

      function refreshWeatherCanvases() {
        refreshWindCanvasSize();
        refreshRainCanvasSize();
      }
      map.on('resize', refreshWeatherCanvases);
      map.on('moveend zoomend', refreshWeatherCanvases);
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
        fetch(data.floodHazardUrl)
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
        setLayerVisible(floodHazardLayer, Boolean(visibility.floodHazard));
        updateRainEffectVisibility();
        updateWindEffectVisibility();
        applyIronMapTint();
        renderLegendControl();
      }

      function renderLayerControl() {
        var control = L.control({ position: 'topright' });
        control.onAdd = function() {
          var wrap = L.DomUtil.create('div', 'layer-control');
          var button = L.DomUtil.create('button', 'layer-control-button', wrap);
          button.type = 'button';
          button.textContent = 'Map Layers';
          var panel = L.DomUtil.create('div', 'layer-control-panel', wrap);
          var title = L.DomUtil.create('div', 'layer-control-title', panel);
          title.textContent = 'Map Layers';
          var rows = [
            ['boundary', 'Calamba Boundary'],
            ['evacuationAreas', 'Evacuation Areas'],
            ['userMarker', 'Your Location'],
            ['route', 'Responder Route'],
            ['floodHazard', 'Flood Hazard'],
            ['rainOverlay', 'Rain Accumulation'],
            ['temperatureOverlay', 'Temperature'],
            ['humidityOverlay', 'Relative Humidity'],
            ['windOverlay', 'Wind Layer'],
          ];
          rows.forEach(function(row) {
            var line = L.DomUtil.create('label', 'layer-control-row', panel);
            line.textContent = row[1];
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = Boolean(visibility[row[0]]);
            checkbox.addEventListener('change', function() {
              visibility[row[0]] = checkbox.checked;
              if ((row[0] === 'rainOverlay' || row[0] === 'temperatureOverlay' || row[0] === 'humidityOverlay') && checkbox.checked) {
                visibility.floodHazard = false;
                visibility.rainOverlay = row[0] === 'rainOverlay';
                visibility.temperatureOverlay = row[0] === 'temperatureOverlay';
                visibility.humidityOverlay = row[0] === 'humidityOverlay';
              }
              if (row[0] === 'floodHazard' && checkbox.checked) {
                visibility.rainOverlay = false;
                visibility.temperatureOverlay = false;
                visibility.humidityOverlay = false;
              }
              panel.querySelectorAll('input').forEach(function(input, index) {
                input.checked = Boolean(visibility[rows[index][0]]);
              });
              applyLayerVisibility();
              updateForecastTimebar();
              var message = JSON.stringify({ type: 'layer-visibility', visibility: visibility });
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(message);
              } else if (window.parent !== window) {
                window.parent.postMessage(message, '*');
              }
            });
            line.appendChild(checkbox);
          });
          button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            panel.classList.toggle('open');
          });
          L.DomEvent.disableClickPropagation(wrap);
          return wrap;
        };
        control.addTo(map);
      }

      var userPinIcon = L.divIcon({
        className: '',
        html: '<div style="align-items:center;background:#ef4444;border:3px solid #fff;border-radius:999px;box-shadow:0 2px 7px rgba(0,0,0,.35);display:flex;height:19px;justify-content:center;width:19px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-user.svg" style="filter:brightness(0) invert(1);height:14px;width:14px" /></div>',
        iconSize: [25, 25],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });
      var userMarker = L.marker([data.userLocation.latitude, data.userLocation.longitude], {
        icon: userPinIcon,
        zIndexOffset: 1000
      }).addTo(userLayer).bindPopup('Your location');

      var areaPinIcon = L.divIcon({
        className: '',
        html: '<div style="align-items:center;background:#e11d48;border:3px solid #fff;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;height:20px;justify-content:center;width:20px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-ambulance.svg" style="filter:brightness(0) invert(1);height:15px;width:15px" /></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -13]
      });

      var selectedAreaPinIcon = L.divIcon({
        className: '',
        html: '<div style="align-items:center;background:#14b8a6;border:3px solid #fff;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;height:22px;justify-content:center;width:22px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-ambulance.svg" style="filter:brightness(0) invert(1);height:16px;width:16px" /></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      var fitBounds = L.latLngBounds([[data.userLocation.latitude, data.userLocation.longitude]]);
      var selectedAreaMarker = null;

      if (data.showAreas) {
        data.allAreas.forEach(function(area){
          if (!inCalamba(Number(area.latitude), Number(area.longitude))) {
            return;
          }
          var isSelected = area.id === data.selectedAreaId;
          var marker = L.marker([area.latitude, area.longitude], {
            icon: isSelected ? selectedAreaPinIcon : areaPinIcon
          }).addTo(areaLayer).bindPopup(
            '<div class="evac-info">' +
              '<div class="head">' + escapeHtml(area.name) +
                (isSelected ? '<span class="selected">Selected evacuation center</span>' : '') +
              '</div>' +
              '<table>' +
                '<tr><td>Type</td><td>' + escapeHtml(area.placeType || 'Evacuation Site') + '</td></tr>' +
                '<tr><td>Barangay</td><td>' + escapeHtml(area.barangay) + '</td></tr>' +
                '<tr><td>Location</td><td>' + escapeHtml(area.locationText) + '</td></tr>' +
                '<tr><td>Capacity</td><td>' + escapeHtml(area.capacity) + '</td></tr>' +
                '<tr><td>Evacuees</td><td>' + escapeHtml(area.evacuees) + '</td></tr>' +
                '<tr><td>Status</td><td><span class="evac-status ' + (area.status === 'full' ? 'full' : 'available') + '">' + (area.status === 'full' ? 'Full' : 'Available') + '</span></td></tr>' +
              '</table>' +
            '</div>',
            { className: 'evacuation-popup', maxWidth: 292, minWidth: 0 }
          );

          if (isSelected) {
            selectedAreaMarker = marker;
          }

          marker.on('click', function() {
            var message = JSON.stringify({ type: 'select-area', areaId: area.id });
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(message);
            } else if (window.parent !== window) {
              window.parent.postMessage(message, '*');
            }
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
      loadWeatherTimeline();
      loadRainImpact();
      renderBoundary();
      renderLayerControl();
      applyLayerVisibility();
      map.on('click', function(event) {
        if (!visibility.floodHazard) {
          return;
        }
        identifyFloodAt(event.latlng);
      });
      if (selectedAreaMarker) {
        window.setTimeout(function() { selectedAreaMarker.openPopup(); }, 200);
      } else {
        userMarker.openPopup();
      }
      window.setTimeout(function() {
        map.invalidateSize();
        refreshWeatherCanvases();
      }, 150);
    </script>
  </body>
</html>
`;
}

export default function RescueMapScreen({ testModeEnabled = false }: Props) {
  const { showNotice, noticeModal } = useNoticeModal();
  const navigation = useNavigation<any>();
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [requestStarted, setRequestStarted] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<EvacuationArea['id'] | null>(null);
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);
  const [proofImageBase64, setProofImageBase64] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaText, setRouteEtaText] = useState<string | null>(null);
  const [routeSource, setRouteSource] = useState<'osrm' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [routingRecommendation, setRoutingRecommendation] = useState(false);
  const [rescueNotes, setRescueNotes] = useState('');
  const [peopleCount, setPeopleCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationArea[]>([]);
  const [recentRescueRecords, setRecentRescueRecords] = useState<RescueRecord[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<UserMapLayerVisibility>({
    boundary: true,
    evacuationAreas: true,
    userMarker: true,
    route: true,
    floodHazard: false,
    rainOverlay: true,
    temperatureOverlay: false,
    humidityOverlay: false,
    windOverlay: true,
  });
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const recordSyncInFlightRef = useRef(false);
  const appliedRoadPlanAreaIdRef = useRef<EvacuationArea['id'] | null>(null);

  const loadEvacuationAreas = useCallback(async () => {
    try {
      const areasResult = await api.get('/content/evacuation-areas').then((res) => res.data);
      if (!Array.isArray(areasResult) || areasResult.length === 0) {
        setEvacuationAreas([]);
        return [];
      }

      const normalized: EvacuationArea[] = areasResult
        .map((item: any, index: number) => {
          const lat = Number(item?.latitude);
          const lon = Number(item?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
          }

          const capacity = Math.max(0, Number(item?.capacity || 0));
          const evacuees = normalizeEvacueesValue(item);
          const reportedStatus = String(item?.evacuation_status || '').toLowerCase();
          const status: EvacuationArea['status'] = reportedStatus === 'full' || capacity <= 0 || evacuees >= capacity
            ? 'full'
            : 'available';

          return {
            id: String(item?.id ?? `db-${index + 1}`),
            name: String(item?.name || 'Evacuation Area'),
            barangay: String(item?.barangay || 'Calamba'),
            placeType: String(item?.place_type || item?.placeType || 'Evacuation Site'),
            locationText: String(
              item?.address ||
                `${String(item?.name || 'Evacuation Area')}, Barangay ${String(item?.barangay || 'Calamba')}, Calamba City, Laguna, Philippines`,
            ),
            capacity,
            evacuees,
            status,
            latitude: lat,
            longitude: lon,
          };
        })
        .filter((item: EvacuationArea | null): item is EvacuationArea => Boolean(item));

      if (normalized.length > 0) {
        setEvacuationAreas(normalized);
        return normalized;
      }

      setEvacuationAreas([]);
      return [];
    } catch {
      setEvacuationAreas([]);
      return [];
    }
  }, []);

  const beginRescueRequest = useCallback(async () => {
    if (!userLocation) {
      return;
    }

    setRequestStarted(true);
    setSelectedAreaId(null);
    setRouteCoordinates([]);
    setRouteDistanceKm(null);
    setRouteEtaText(null);
    setRouteSource(null);
    setLayerVisibility((current) => ({
      ...current,
      evacuationAreas: true,
      userMarker: true,
      route: true,
    }));
    const latestAreas = await loadEvacuationAreas();
    if (!latestAreas.some((area) => !isAreaFull(area))) {
      showNotice('No available evacuation area', 'All evacuation areas are currently full. Please try again shortly.');
      return;
    }

    setRoutingRecommendation(true);
    try {
      const plan = await resolveBestRoadPlan(userLocation, latestAreas);
      if (!plan) {
        showNotice(
          'No reachable evacuation area',
          'No available evacuation center could be reached through the current road network. Please try again shortly.',
        );
        return;
      }
      applyRoadPlan(plan);
    } catch {
      showNotice(
        'Road routing unavailable',
        'Unable to verify a safe road route to an evacuation center. Please check your connection and try again.',
      );
    } finally {
      setRoutingRecommendation(false);
    }
  }, [loadEvacuationAreas, showNotice, userLocation]);

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

  function applyRoadPlan(plan: RescuePlan) {
    appliedRoadPlanAreaIdRef.current = plan.area.id;
    setSelectedAreaId(plan.area.id);
    setRouteCoordinates(plan.routeCoordinates);
    setRouteDistanceKm(plan.distanceKm);
    setRouteEtaText(plan.etaText);
    setRouteSource(plan.source);
  }

  useEffect(() => {
    if (!requestStarted || !userLocation || !selectedArea) {
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaText(null);
      setRouteSource(null);
      return;
    }

    if (appliedRoadPlanAreaIdRef.current === selectedArea.id) {
      appliedRoadPlanAreaIdRef.current = null;
      return;
    }

    let active = true;
    setRoutingRecommendation(true);

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
        setSelectedAreaId(null);
        setRouteCoordinates([]);
        setRouteDistanceKm(null);
        setRouteEtaText(null);
        setRouteSource(null);
        showNotice(
          'Evacuation center unreachable',
          `${selectedArea.name} does not have a practical driving route from your current location. Please choose another center.`,
        );
      })
      .finally(() => {
        if (active) {
          setRoutingRecommendation(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestStarted, selectedArea?.id, selectedArea?.latitude, selectedArea?.longitude, showNotice, userLocation]);

  const apiBaseUrl = String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '');

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
      isMapFullscreen,
    );
  }, [evacuationAreas, layerVisibility, apiBaseUrl, isMapFullscreen, requestStarted, routeCoordinates, selectedAreaId, userLocation]);

  async function handleUploadProof() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showNotice('Permission needed', 'Please allow photo access to upload proof.');
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

  async function handleMapMessage(data: string) {
    try {
      const payload = JSON.parse(data) as {
        type?: string;
        areaId?: string;
        visibility?: Partial<UserMapLayerVisibility>;
      };
      if (payload.type === 'layer-visibility' && payload.visibility) {
        setLayerVisibility((current) => ({ ...current, ...payload.visibility }));
        return;
      }
      if (payload.type === 'select-area' && payload.areaId) {
        const chosen = evacuationAreas.find((area) => area.id === payload.areaId);
        if (!chosen) {
          return;
        }

        if (!hasCapacityFor(chosen, peopleCount)) {
          if (!userLocation) {
            return;
          }
          setRoutingRecommendation(true);
          try {
            const plan = await resolveBestRoadPlan(userLocation, evacuationAreas, peopleCount);
            if (plan) {
              applyRoadPlan(plan);
              showNotice(
                'Area at full capacity',
                `${chosen.name} is full. The shortest reachable road route is to ${plan.area.name}.`,
              );
            } else {
              setSelectedAreaId(null);
              showNotice('No reachable evacuation area', 'No available evacuation center is reachable through the current road network.');
            }
          } catch {
            setSelectedAreaId(null);
            showNotice('Road routing unavailable', 'Unable to verify another reachable evacuation center right now.');
          } finally {
            setRoutingRecommendation(false);
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

    if (!hasCapacityFor(refreshedSelected, peopleCount)) {
      setRoutingRecommendation(true);
      try {
        const plan = await resolveBestRoadPlan(userLocation, latestAreas, peopleCount);
        if (plan) {
          applyRoadPlan(plan);
          showNotice(
            'Area at full capacity',
            `${refreshedSelected.name} is full. The shortest reachable road route is to ${plan.area.name}.`,
          );
        } else {
          setSelectedAreaId(null);
          showNotice('No reachable evacuation area', 'No available evacuation center is reachable through the current road network.');
        }
      } catch {
        setSelectedAreaId(null);
        showNotice('Road routing unavailable', 'Unable to verify another reachable evacuation center right now.');
      } finally {
        setRoutingRecommendation(false);
      }
      return;
    }

    try {
      setSubmitting(true);
      const locationText = `Lat ${userLocation.latitude.toFixed(6)}, Lng ${userLocation.longitude.toFixed(6)}`;
      const session = await loadSession();
      const token = String(session?.token || '').trim();
      if (!token) {
        showNotice('Session expired', 'Please log in again before submitting a rescue request.');
        return;
      }

      // Ensure auth header is present for this submit call.
      setApiAuthorizationToken(token);
      const fullName = `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim() || session?.user?.username || '';
      const contactNumber = session?.user?.contactNumber || '';

      await api.post('/reports', {
        reportType: 'rescue',
        testModeBypassServiceArea: testModeEnabled,
        incidentType: 'Request Rescue',
        location: locationText,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        evacuationAreaId: selectedArea.id,
        evacuationAreaName: refreshedSelected.name,
        arePeopleTrapped: true,
        estimatedPeople: peopleCount,
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
      setPeopleCount(1);
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaText(null);
      setRouteSource(null);
      await loadRecentRescueRecords();

      showNotice('Request submitted', 'Your rescue request has been submitted with image proof.');
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);
      const errorCode = String(err?.response?.data?.code || '');
      if (errorCode === 'NO_AVAILABLE_EVACUATION_AREA' && userLocation) {
        setRoutingRecommendation(true);
        try {
          const refreshedAreas = await loadEvacuationAreas();
          const replacementPlan = await resolveBestRoadPlan(userLocation, refreshedAreas, peopleCount);
          if (replacementPlan) {
            applyRoadPlan(replacementPlan);
            showNotice(
              'Evacuation route updated',
              `The previous center became unavailable. The shortest reachable road route is now to ${replacementPlan.area.name}. Please review and submit again.`,
            );
          } else {
            setSelectedAreaId(null);
            showNotice('No reachable evacuation area', 'No available evacuation center is currently reachable through the road network.');
          }
        } catch {
          setSelectedAreaId(null);
          showNotice('Road routing unavailable', 'Unable to calculate a replacement evacuation route right now.');
        } finally {
          setRoutingRecommendation(false);
        }
        return;
      }
      const message =
        err?.response?.data?.message ||
        (status === 401
          ? 'Your session has expired. Please log in again, then resubmit your rescue request.'
          : status === 413
            ? 'Uploaded image is too large. Please choose a smaller image and try again.'
            : !err?.response
              ? 'Cannot reach the server right now. Please check your connection and try again.'
              : 'Unable to submit rescue request.');
      const notice = submissionErrorNotice(err, message);
      showNotice(notice.title, notice.message);
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
      {noticeModal}
      <DashboardHeader />

      <ScrollView contentContainerStyle={st.scrollContent}>
        <Text style={st.pageTitle}>Request Rescue</Text>
        {/* Fullscreen map modal */}
        <Modal visible={isMapFullscreen} animationType="fade" statusBarTranslucent onRequestClose={() => setIsMapFullscreen(false)}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <PlatformMap style={{ flex: 1 }} html={mapHtml} baseUrl={apiBaseUrl} onMessage={handleMapMessage} />
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
          <PlatformMap style={st.map} html={mapHtml} baseUrl={apiBaseUrl} onMessage={handleMapMessage} />
          {/* Fullscreen enter — bottom-right */}
          <TouchableOpacity
            style={st.fsEnterBtn}
            activeOpacity={0.85}
            onPress={() => setIsMapFullscreen(true)}
          >
            <MaterialCommunityIcons name="fullscreen" size={18} color="#fff" />
          </TouchableOpacity>
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
                  !proofImageUri || !proofImageBase64 || !selectedArea || routeSource !== 'osrm' || routingRecommendation || submitting
                    ? st.submitBtnDisabled
                    : null,
                ]}
                activeOpacity={0.88}
                disabled={!proofImageUri || !proofImageBase64 || !selectedArea || routeSource !== 'osrm' || routingRecommendation || submitting}
                onPress={handleSubmitRescue}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.submitBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
            <View style={st.peopleSelector}>
              <View style={st.peopleSelectorCopy}>
                <Text style={st.peopleSelectorLabel}>People needing rescue</Text>
                <Text style={st.peopleSelectorHint}>This number will be transported to the evacuation site.</Text>
              </View>
              <View style={st.peopleSelectorControls}>
                <TouchableOpacity
                  style={[st.peopleSelectorButton, peopleCount <= 1 && st.peopleSelectorButtonDisabled]}
                  onPress={() => setPeopleCount((count) => Math.max(1, count - 1))}
                  disabled={peopleCount <= 1}
                  accessibilityLabel="Decrease people count"
                >
                  <Text style={st.peopleSelectorButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={st.peopleSelectorValue}>{peopleCount}</Text>
                <TouchableOpacity
                  style={[st.peopleSelectorButton, peopleCount >= 100 && st.peopleSelectorButtonDisabled]}
                  onPress={() => setPeopleCount((count) => Math.min(100, count + 1))}
                  disabled={peopleCount >= 100}
                  accessibilityLabel="Increase people count"
                >
                  <Text style={st.peopleSelectorButtonText}>+</Text>
                </TouchableOpacity>
              </View>
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
              disabled={routingRecommendation}
              onPress={() => {
                if (requestStarted) {
                  setRequestStarted(false);
                  setSelectedAreaId(null);
                  setProofImageUri(null);
                  setProofImageBase64(null);
                  setRescueNotes('');
                  setPeopleCount(1);
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
              <Text style={st.actionText}>
                {routingRecommendation ? 'Finding Road Route...' : requestStarted ? 'Cancel' : 'Send Rescue Request'}
              </Text>
            </TouchableOpacity>
          </View>

          {requestStarted ? (
            <>
              <Text style={st.areaSectionTitle}>Nearest Evacuation Center</Text>
              <Text style={st.areaCountText}>The nearest available center is selected automatically. Tap another map marker to review a different center.</Text>

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
                    <Text style={st.areaMetaLabel}>Status:</Text>
                    <Text style={[st.areaStatus, isAreaFull(selectedArea) ? st.areaStatusFull : st.areaStatusAvailable]}>
                      {isAreaFull(selectedArea) ? 'Full' : 'Available'}
                    </Text>
                    <Text style={st.areaMetaLabel}>Route Distance:</Text>
                    <Text style={st.areaAddr}>{routeDistanceKm ? `${routeDistanceKm.toFixed(2)} km` : 'Calculating...'}</Text>
                    <Text style={st.areaMetaLabel}>ETA:</Text>
                    <Text style={st.areaAddr}>{routeEtaText || 'Calculating...'}</Text>
                    <Text style={st.areaMetaLabel}>Route Type:</Text>
                    <Text style={st.areaAddr}>{routeSource === 'osrm' ? 'Verified driving route' : 'Verifying road access...'}</Text>
                  </View>
                </View>
              ) : (
                <View style={st.areaHintCard}>
                  <Text style={st.areaHintText}>
                    {routingRecommendation
                      ? 'Comparing road distance and reachability for every available evacuation center...'
                      : 'No road-reachable evacuation center is selected. Tap a map pin to check another center.'}
                  </Text>
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
  root: { flex: 1, backgroundColor: editorial.background },
  loadingWrap: { flex: 1, backgroundColor: editorial.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#475569', marginTop: 10, fontSize: 13, fontWeight: '600' },

  scrollContent: { flexGrow: 1, paddingTop: 16, paddingBottom: 110, backgroundColor: editorial.background },
  pageTitle: { color: editorial.ink, fontSize: 24, lineHeight: 28, marginHorizontal: 14, marginBottom: 6 },

  mapContainer: {
    marginHorizontal: 14, marginTop: 10, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: editorial.border, aspectRatio: 1.08, minHeight: 280, maxHeight: 420, backgroundColor: editorial.surface,
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
  mapBottomActionsWrap: { paddingHorizontal: 14, marginTop: 8 },

  notesInput: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: editorial.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: editorial.ink,
    minHeight: 72,
    lineHeight: 19,
  },

  listWrap: { paddingHorizontal: 14, marginTop: 12 },
  areaSectionTitle: { color: editorial.ink, fontSize: 18, fontWeight: '400', marginBottom: 8 },
  areaCountText: { color: '#475569', fontSize: 11, fontWeight: '600', marginBottom: 8 },
  areaCard: {
    backgroundColor: editorial.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderColor: editorial.border,
  },
  areaCardSelected: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  areaName: { color: '#181818', fontSize: 14, fontWeight: '700' },
  areaMetaLabel: { color: editorial.muted, fontSize: 11, marginTop: 5, fontWeight: '700' },
  areaAddr: { color: '#585858', fontSize: 12, marginTop: 2 },
  areaStatus: { alignSelf: 'flex-start', borderRadius: 999, fontSize: 11, fontWeight: '800', marginTop: 3, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  areaStatusAvailable: { backgroundColor: '#dcfce7', color: '#166534' },
  areaStatusFull: { backgroundColor: '#fee2e2', color: '#991b1b' },
  areaBestTag: { color: '#15803d', fontSize: 11, marginTop: 4, fontWeight: '700' },
  areaHintCard: {
    backgroundColor: editorial.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: editorial.border,
  },
  areaHintText: { color: editorial.muted, fontSize: 11, fontWeight: '600' },

  actionWrap: { paddingHorizontal: 14, marginTop: 2 },
  actionBtn: {
    backgroundColor: editorial.accent,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  actionText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  bottomActionRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  peopleSelector: { marginTop: 10, borderWidth: 1, borderColor: editorial.border, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  peopleSelectorCopy: { flex: 1, minWidth: 0 },
  peopleSelectorLabel: { color: editorial.ink, fontSize: 13, fontWeight: '900' },
  peopleSelectorHint: { color: editorial.muted, fontSize: 10, marginTop: 2, lineHeight: 14 },
  peopleSelectorControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  peopleSelectorButton: { width: 34, height: 34, borderRadius: 9, backgroundColor: editorial.accent, alignItems: 'center', justifyContent: 'center' },
  peopleSelectorButtonDisabled: { backgroundColor: '#cbd5e1' },
  peopleSelectorButtonText: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  peopleSelectorValue: { minWidth: 28, color: editorial.ink, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  uploadBtn: {
    flex: 1,
    backgroundColor: editorial.accent,
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
