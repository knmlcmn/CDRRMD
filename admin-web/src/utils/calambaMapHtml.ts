import type { EvacuationAreaItem } from '../types';

export type Coordinate = { latitude: number; longitude: number };
export type MonitoringLayerVisibility = {
  boundary: boolean;
  floodHazard: boolean;
  evacuationAreas: boolean;
  incidentMarkers: boolean;
  responderRoute: boolean;
  weatherOverlay: boolean;
  windOverlay: boolean;
};

const MIN_ACTIVE_RAIN_MM_PER_HOUR = 0.1;
export function buildCalambaMapHtml(
  areas: EvacuationAreaItem[],
  responderLocation: Coordinate | null,
  routeCoordinates: Coordinate[],
  incidentLocation: Coordinate | null,
  selectedReportCode: string | null,
  incidentPoints: Array<{ reportCode: string; latitude: number; longitude: number; status: string; reportType: string }>,
  barangayBoundaryGeoJsonUrl: string,
  floodHazardRasterUrl: string,
  rainImpactUrl: string,
  windDataUrl: string,
  layerVisibility: MonitoringLayerVisibility,
) {
  const payload = JSON.stringify({
    areas,
    responderLocation,
    routeCoordinates,
    incidentLocation,
    selectedReportCode,
    incidentPoints,
    barangayBoundaryGeoJsonUrl,
    floodHazardRasterUrl,
    rainImpactUrl,
    windDataUrl,
    layerVisibility,
    boundaryGeoJson: {
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
    },
  });
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
    <style>
      html, body, #map { margin: 0; width: 100%; height: 100%; }
      body { background: #163047; }
      .map-legend {
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
        color: #0f172a;
        font: 11px/1.25 Arial, sans-serif;
        padding: 6px 8px;
        pointer-events: none;
        width: min(188px, calc(100vw - 24px));
      }
      .legend-toggle {
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid #1e3a5f;
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
        font: 700 11px/1 Arial, sans-serif;
        padding: 8px 10px;
      }
      .map-legend .title { font-weight: 700; margin-bottom: 6px; }
      .map-legend .row { align-items: center; display: flex; margin: 3px 0; }
      .map-legend .swatch { border: 1px solid rgba(15,23,42,0.25); height: 12px; margin-right: 6px; width: 12px; }
      .map-legend .line { border-top: 3px solid #111111; margin-right: 6px; width: 14px; }
      .map-legend .pin { background: #e11d48; border: 2px solid #fff; border-radius: 999px; box-shadow: 0 1px 4px rgba(0,0,0,.25); height: 10px; margin-right: 6px; width: 10px; }
      .map-legend .user { background: #ef4444; border: 2px solid #fff; border-radius: 999px; box-shadow: 0 1px 4px rgba(0,0,0,.25); height: 10px; margin-right: 6px; width: 10px; }
      .map-legend .route { border-top: 4px solid #22c55e; margin-right: 6px; width: 16px; }
      .map-legend .rain { border-top: 1px solid #dbe3ec; color: #334155; font-size: 11px; margin-top: 7px; padding-top: 6px; }
      .map-legend .updated { color: #64748b; font-size: 11px; margin-top: 4px; }
      .legend-section-label { align-items: center; border-top: 1px solid #e2e8f0; color: #1e40af; display: flex; font-size: 10px; font-weight: 800; gap: 5px; margin-top: 7px; padding-top: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
      .legend-section-dot { border-radius: 999px; display: inline-block; flex-shrink: 0; height: 8px; width: 8px; }
      .flood-info { font: 12px/1.28 Arial, sans-serif; min-width: 168px; max-width: 230px; }
      .flood-info .head { background: #0891b2; color: #fff; font-weight: 800; margin: -8px -10px 8px; padding: 7px 10px; }
      .flood-info table { border-collapse: collapse; width: 100%; }
      .flood-info td { border: 1px solid #cbd5e1; padding: 4px 6px; }
      .flood-info td:first-child { background: #f8fafc; font-weight: 700; width: 42%; }
      .city-alert-banner {
        background: rgba(185, 28, 28, 0.92);
        border: 1px solid #7f1d1d;
        border-radius: 10px;
        box-shadow: 0 4px 14px rgba(127, 29, 29, 0.35);
        color: #fff;
        font: 700 12px/1.3 Arial, sans-serif;
        margin: 8px auto 0;
        max-width: min(88vw, 520px);
        padding: 8px 10px;
        text-align: center;
      }
      .city-alert-banner-wrap {
        position: relative;
      }
      .city-alert-close {
        align-items: center;
        background: rgba(17, 24, 39, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.38);
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font: 700 12px/1 Arial, sans-serif;
        height: 24px;
        justify-content: center;
        position: absolute;
        right: 4px;
        top: -10px;
        width: 24px;
      }
      .weather-popup {
        font: 12px/1.3 Arial, sans-serif;
        max-width: min(90vw, 272px);
        min-width: min(200px, calc(100vw - 30px));
        width: 100%;
      }
      .weather-popup .head { background: #1d4ed8; color: #fff; font-weight: 800; margin: -8px -10px 8px; padding: 7px 10px; }
      .weather-popup table { border-collapse: collapse; width: 100%; }
      .weather-popup td { border: 1px solid #cbd5e1; padding: 4px 6px; }
      .weather-popup td:first-child { background: #f8fafc; font-weight: 700; width: 50%; }
      .map-rain-canvas {
        inset: 0;
        opacity: 0;
        pointer-events: none;
        position: absolute;
        transition: opacity .28s ease;
        z-index: 1;
      }
      .map-rain-motion-canvas { inset: 0; pointer-events: none; position: absolute; z-index: 2; }
      .map-wind-canvas {
        inset: 0;
        opacity: .5;
        pointer-events: none;
        position: absolute;
        z-index: 3;
      }
      .wind-live-hud { backdrop-filter: blur(7px); background: rgba(61,61,61,.9); border: 1px solid rgba(255,255,255,.28); border-radius: 18px; color: #fff; display: none; font: 700 11px/1.35 Arial,sans-serif; left: 50%; padding: 7px 13px; pointer-events: none; position: absolute; top: 10px; transform: translateX(-50%); z-index: 700; white-space: nowrap; box-shadow: 0 3px 12px rgba(0,0,0,.34); }
      .wind-live-hud .wind-source { color: #facc15; }
      .wind-live-hud.wind-error { background: rgba(127,29,29,.94); border-color: rgba(254,202,202,.55); max-width: min(520px,calc(100vw - 28px)); white-space: normal; text-align: center; }
      .forecast-timebar { backdrop-filter: blur(9px); background: rgba(7,17,24,.94); border: 1px solid rgba(148,163,184,.35); border-radius: 18px; bottom: 12px; box-shadow: 0 5px 18px rgba(0,0,0,.38); color: #fff; display: none; left: 50%; max-width: min(94vw, 1340px); padding: 8px 14px 7px; pointer-events: auto; position: absolute; transform: translateX(-50%); width: calc(100% - 28px); z-index: 700; }
      .forecast-time-track { position: relative; }
      .forecast-time-labels { display: flex; justify-content: space-between; margin: 0 8px 3px; }
      .forecast-time-label { color: #f8fafc; font: 700 14px/1.1 Arial,sans-serif; text-align: center; }
      .forecast-time-date { color: #cbd5e1; display: block; font: 11px/1 Arial,sans-serif; }
      .forecast-time-range { appearance: none; background: repeating-linear-gradient(90deg, rgba(203,213,225,.7) 0 1px, transparent 1px 12px); border: 0; display: block; height: 30px; margin: 0; outline: none; width: 100%; }
      .forecast-time-range::-webkit-slider-thumb { appearance: none; background: #f97316; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 2px rgba(249,115,22,.3); cursor: grab; height: 18px; width: 5px; }
      .forecast-time-range::-moz-range-thumb { background: #f97316; border: 2px solid #fff; border-radius: 50%; cursor: grab; height: 18px; width: 5px; }
      .forecast-time-summary { color: #dbeafe; font: 700 10px/1.3 Arial,sans-serif; text-align: center; white-space: nowrap; }
      /* In-map layer control */
      .layer-ctrl-wrap {
        font-family: Arial, sans-serif;
        position: relative;
      }
      /* Collapsed: icon pill button */
      .layer-ctrl-btn {
        align-items: center;
        background: rgba(15,23,42,0.88);
        border: 1px solid rgba(148,163,184,0.4);
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
        display: flex;
        gap: 5px;
        padding: 7px 10px;
        transition: background 0.15s;
        white-space: nowrap;
      }
      .layer-ctrl-btn:hover { background: rgba(15,23,42,0.98); }
      /* Expanded icon-grid panel */
      .layer-ctrl-panel {
        background: rgba(13,20,35,0.96);
        border: 1px solid rgba(148,163,184,0.25);
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.6);
        display: none;
        margin-top: 6px;
        padding: 10px 8px 8px;
        position: absolute;
        right: 0;
        top: 100%;
        width: 192px;
        z-index: 900;
      }
      .layer-ctrl-panel-open { display: block; }
      .layer-ctrl-title {
        border-bottom: 1px solid rgba(148,163,184,0.18);
        color: #94a3b8;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        margin-bottom: 8px;
        padding-bottom: 5px;
        text-align: center;
        text-transform: uppercase;
      }
      /* Icon grid - 3 per row */
      .layer-icon-grid {
        display: grid;
        gap: 6px;
        grid-template-columns: repeat(3, 1fr);
      }
      .layer-icon-item {
        align-items: center;
        border: 1.5px solid transparent;
        border-radius: 10px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 4px 5px;
        transition: background 0.12s, border-color 0.12s;
        user-select: none;
      }
      .layer-icon-item:hover { background: rgba(148,163,184,0.12); }
      .layer-icon-item.layer-icon-on {
        background: rgba(56,189,248,0.15);
        border-color: rgba(56,189,248,0.7);
      }
      .layer-icon-svg {
        display: block;
        flex-shrink: 0;
        height: 26px;
        width: 26px;
      }
      .layer-icon-label {
        color: #cbd5e1;
        font-size: 9px;
        font-weight: 700;
        line-height: 1.15;
        text-align: center;
      }
      .layer-icon-item.layer-icon-on .layer-icon-label { color: #38bdf8; }
      @media (max-width: 768px) {
        .legend-toggle { font: 700 10px/1 Arial, sans-serif; padding: 6px 8px; }
        .map-legend { width: min(162px, calc(100vw - 20px)); font-size: 10px; }
        .flood-info { min-width: 146px; max-width: 190px; font-size: 11px; }
        .city-alert-banner { font-size: 11px; padding: 7px 8px; }
        .weather-popup {
          font-size: 11px;
          max-width: min(92vw, 238px);
          min-width: min(176px, calc(100vw - 24px));
        }
        .forecast-timebar { bottom: 8px; max-width: calc(100vw - 18px); }
        .forecast-time-button { padding: 6px 7px; }
        .forecast-time-summary { overflow: hidden; text-overflow: ellipsis; }
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      var payload = ${payload};
      var visibility = Object.assign({
        boundary: true,
        floodHazard: true,
        evacuationAreas: true,
        incidentMarkers: true,
        responderRoute: true,
        weatherOverlay: true,
        windOverlay: false
      }, payload.layerVisibility || {});
      var calambaCenter = [14.206021, 121.1556496];
      var calambaBounds = L.latLngBounds([[14.137703, 121.0218057], [14.2662133, 121.2214277]]);
      var map = L.map('map', {
        zoomControl: true,
        attributionControl: false,
        minZoom: 11,
        maxZoom: 18,
        maxBounds: calambaBounds.pad(0.05),
        maxBoundsViscosity: 0.9,
      }).setView(calambaCenter, 12);

      // Leaflet panes share one stacking context. Weather must live inside its
      // own pane so it renders above tiles (200) and below vectors/markers (400+).
      var weatherSurfacePane = map.createPane('weatherSurfacePane');
      weatherSurfacePane.style.zIndex = '350';
      weatherSurfacePane.style.pointerEvents = 'none';

      var baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''
      }).addTo(map);

      function applyBasemap() {
        // Keep map labels and roads readable beneath the 50% rain surface.
        var tilePane = map.getPanes().tilePane;
        if (tilePane) {
          tilePane.style.filter = Boolean(visibility.weatherOverlay)
            ? 'grayscale(0.28) brightness(0.94) contrast(0.98)'
            : '';
        }
      }

      applyBasemap();

      function inCalamba(lat, lon) {
        return lat >= 14.137703 && lat <= 14.2662133 && lon >= 121.0218057 && lon <= 121.2214277;
      }

      function isWithinCalambaBoundary(latlng) {
        var boundaryFeature = payload.boundaryGeoJson && payload.boundaryGeoJson.features && payload.boundaryGeoJson.features[0];
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
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      var fitBounds = L.latLngBounds([calambaCenter]);
      var boundaryLayer = L.layerGroup();
      var floodHazardLayer = L.layerGroup();
      var barangayBoundaryLayer = L.layerGroup();
      var barangayBoundaryGeoJsonData = null;
      var weatherFillGeoJsonData = null;
      var weatherImpactByBarangay = {};
      var cityRainIntensityMmPerHour = 0;
      var rainCanvas = null;
      var rainCtx = null;
      var rainMotionCanvas = null;
      var rainMotionCtx = null;
      var rainParticles = [];
      var rainAnimationFrame = null;
      var rainAccumulationHours = 24;
      var windCanvas = null;
      var windCtx = null;
      var windBackgroundCanvas = null;
      var windHud = null;
      var windFieldData = null;
      var weatherTimelineData = null;
      var weatherTimeframe = 'hour_0';
      var forecastTimebar = null;
      var windParticles = [];
      var windAnimationFrame = null;
      var windLoadState = 'idle';
      var areaLayer = L.layerGroup();
      var incidentLayer = L.layerGroup();
      var responderRouteLayer = L.layerGroup();
      var cityAlertControl = null;
      var legendVisible = false;
      var legendControl = null;
      var legendToggleControl = null;
      var lastLegendUpdatedAt = null;
      var latestBarangayGeoJsonData = null;
      var selectedBarangayKey = null;
      var focusedBarangayKey = null;
      var focusedBarangayRiskLevel = null;
      var focusModeActive = false;
      var pendingFocusFit = false;
      var barangayLayerByKey = {};
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

      function ensureRainCanvas() {
        if (rainCanvas) {
          return;
        }

        rainCanvas = document.createElement('canvas');
        rainCanvas.className = 'map-rain-canvas';
        weatherSurfacePane.appendChild(rainCanvas);
        rainCtx = rainCanvas.getContext('2d');
        rainMotionCanvas = document.createElement('canvas');
        rainMotionCanvas.className = 'map-rain-motion-canvas';
        rainMotionCanvas.style.display = 'none';
        weatherSurfacePane.appendChild(rainMotionCanvas);
        rainMotionCtx = rainMotionCanvas.getContext('2d');
        refreshRainCanvasSize();
      }

      function refreshRainCanvasSize() {
        if (!rainCanvas) {
          return;
        }

        var size = map.getSize();
        var topLeft = map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(rainCanvas, topLeft);
        rainCanvas.width = Math.max(1, Number(size.x) || 1);
        rainCanvas.height = Math.max(1, Number(size.y) || 1);
        if (rainMotionCanvas) {
          L.DomUtil.setPosition(rainMotionCanvas, topLeft);
          rainMotionCanvas.width = rainCanvas.width;
          rainMotionCanvas.height = rainCanvas.height;
          seedRainParticles();
        }
        renderRainAccumulationSurface();
      }

      function updateWeatherHud() {
        ensureForecastTimebar();
        updateForecastTimebar();
      }

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
        if (weatherTimelineData && weatherTimelineData.frames && weatherTimelineData.frames[weatherTimeframe]) {
          return weatherTimelineData.frames[weatherTimeframe];
        }
        return windFieldData;
      }

      function updateForecastTimebar() {
        if (!forecastTimebar) return;
        var visible = (Boolean(visibility.weatherOverlay) || Boolean(visibility.windOverlay)) && !focusModeActive;
        forecastTimebar.style.display = visible ? 'block' : 'none';
        if (!visible) return;
        var range = forecastTimebar.querySelector('.forecast-time-range');
        if (range) range.value = String(Number(String(weatherTimeframe).slice(5)) || 0);
        forecastTimebar.querySelectorAll('.forecast-time-label').forEach(function(label) {
          var dayOffset = Number(label.dataset.dayOffset || 0);
          var dayFrame = weatherTimelineData && weatherTimelineData.frames
            ? weatherTimelineData.frames['hour_' + (dayOffset * 24)]
            : null;
          label.innerHTML = dayFrame
            ? String(dayFrame.label) + '<span class="forecast-time-date">' + String(dayFrame.dateLabel) + '</span>'
            : 'Day ' + (dayOffset + 1);
        });
        var summary = forecastTimebar.querySelector('.forecast-time-summary');
        if (!summary) return;
        if (windLoadState === 'error') {
          summary.textContent = 'Open-Meteo forecast unavailable · retrying automatically';
          return;
        }
        var frame = activeForecastFrame();
        if (!frame || windLoadState === 'loading') {
          summary.textContent = 'Loading Open-Meteo forecast...';
          return;
        }
        if (Boolean(visibility.weatherOverlay)) {
          summary.textContent = String(frame.label || 'Day') + ' ' + String(frame.dateLabel || '') + ' ' + String(frame.hourLabel || '') + ' - Rain ' +
            Number(frame.averageRainAmountMm || 0).toFixed(1) + ' mm - Wind ' + Number(frame.averageSpeedKph || 0).toFixed(0) + ' km/h';
        } else {
          summary.textContent = String(frame.label || 'Wind') + ': ' +
            Number(frame.averageSpeedKph || 0).toFixed(0) + ' km/h average · gusts ' +
            Number(frame.maximumGustKph || 0).toFixed(0) + ' km/h';
        }
      }

      function applyWeatherTimeframe(key) {
        if (!weatherTimelineData || !weatherTimelineData.frames || !weatherTimelineData.frames[key]) return;
        weatherTimeframe = key;
        windFieldData = weatherTimelineData.frames[key];
        refreshRainCanvasSize();
        refreshWindCanvasSize();
        updateRainEffectVisibility();
        updateWindEffectVisibility();
        updateForecastTimebar();
        renderLegendControl();
      }

      function ensureForecastTimebar() {
        if (forecastTimebar) return;
        forecastTimebar = document.createElement('div');
        forecastTimebar.className = 'forecast-timebar';
        var track = document.createElement('div');
        track.className = 'forecast-time-track';
        var labels = document.createElement('div');
        labels.className = 'forecast-time-labels';
        for (var dayOffset = 0; dayOffset < 7; dayOffset += 1) {
          var label = document.createElement('div');
          label.className = 'forecast-time-label';
          label.dataset.dayOffset = String(dayOffset);
          labels.appendChild(label);
        }
        var range = document.createElement('input');
        range.type = 'range'; range.className = 'forecast-time-range'; range.min = '0'; range.max = '167'; range.step = '1'; range.value = '0';
        range.addEventListener('input', function(event) {
          event.stopPropagation();
          applyWeatherTimeframe('hour_' + event.target.value);
        });
        track.appendChild(labels); track.appendChild(range);
        var summary = document.createElement('div');
        summary.className = 'forecast-time-summary';
        forecastTimebar.appendChild(track);
        forecastTimebar.appendChild(summary);
        forecastTimebar.addEventListener('mousedown', function(event) { event.stopPropagation(); });
        forecastTimebar.addEventListener('dblclick', function(event) { event.stopPropagation(); });
        map.getContainer().appendChild(forecastTimebar);
        updateForecastTimebar();
      }

      function rainSamplesForMap() {
        var frame = activeForecastFrame();
        if (frame && Array.isArray(frame.points) && frame.points.some(function(point) { return Number.isFinite(Number(point.rainAmountMm)); })) {
          return frame.points.map(function(point) {
            var position = map.latLngToContainerPoint([Number(point.latitude), Number(point.longitude)]);
            return { x: position.x, y: position.y, value: Math.max(0, Number(point.rainAmountMm) || 0) };
          });
        }
        var features = weatherFillGeoJsonData && Array.isArray(weatherFillGeoJsonData.features)
          ? weatherFillGeoJsonData.features
          : [];
        return features.map(function(feature) {
          var props = feature && feature.properties ? feature.properties : {};
          var layer = L.geoJSON(feature);
          var bounds = layer.getBounds && layer.getBounds();
          if (!bounds || !bounds.isValid()) return null;
          var center = map.latLngToContainerPoint(bounds.getCenter());
          var hourly = Number(props.rain_intensity_mm_per_hour || props.average_rainfall_mm_per_hour || 0);
          var accumulation = Number(props.rain_accumulation_24h_mm);
          return { x: center.x, y: center.y, value: Math.max(0, Number.isFinite(accumulation) ? accumulation : hourly * rainAccumulationHours) };
        }).filter(Boolean);
      }

      function rainAmountAt(lat, lon) {
        var frame = activeForecastFrame();
        if (!frame || !Array.isArray(frame.points) || frame.points.length === 0) return null;
        var bounds = frame.bounds || {};
        var rows = Math.max(2, Number(frame.rows) || 2);
        var cols = Math.max(2, Number(frame.cols) || 2);
        var latSpan = Math.max(0.000001, Number(bounds.latMax) - Number(bounds.latMin));
        var lonSpan = Math.max(0.000001, Number(bounds.lonMax) - Number(bounds.lonMin));
        var rowFloat = Math.max(0, Math.min(rows - 1, ((Number(bounds.latMax) - lat) / latSpan) * (rows - 1)));
        var colFloat = Math.max(0, Math.min(cols - 1, ((lon - Number(bounds.lonMin)) / lonSpan) * (cols - 1)));
        var row0 = Math.floor(rowFloat);
        var row1 = Math.min(rows - 1, row0 + 1);
        var col0 = Math.floor(colFloat);
        var col1 = Math.min(cols - 1, col0 + 1);
        var rowMix = rowFloat - row0;
        var colMix = colFloat - col0;
        function at(row, col) {
          return Math.max(0, Number(frame.points[row * cols + col] && frame.points[row * cols + col].rainAmountMm) || 0);
        }
        var top = at(row0, col0) + (at(row0, col1) - at(row0, col0)) * colMix;
        var bottom = at(row1, col0) + (at(row1, col1) - at(row1, col0)) * colMix;
        return top + (bottom - top) * rowMix;
      }

      function rainHoursForTimeframe() {
        return 1;
      }

      function resetRainParticle(particle, randomY) {
        if (!rainMotionCanvas) return;
        var tries = 0;
        do {
          particle.x = Math.random() * rainMotionCanvas.width;
          particle.y = randomY ? Math.random() * rainMotionCanvas.height : -8 - Math.random() * 30;
          tries += 1;
        } while (tries < 16 && !isWithinCalambaBoundary(map.containerPointToLatLng([particle.x, Math.max(0, particle.y)])));
        particle.speed = 1.8 + Math.random() * 2.8;
        particle.length = 3 + Math.random() * 7;
        particle.threshold = Math.random();
      }

      function seedRainParticles() {
        if (!rainMotionCanvas) return;
        var count = Math.max(180, Math.min(480, Math.round((rainMotionCanvas.width * rainMotionCanvas.height) / 1200)));
        rainParticles = [];
        for (var index = 0; index < count; index += 1) {
          var particle = {};
          resetRainParticle(particle, true);
          rainParticles.push(particle);
        }
      }

      function animateRainCanvas() {
        if (!rainMotionCanvas || !rainMotionCtx || !Boolean(visibility.weatherOverlay) || focusModeActive) {
          rainAnimationFrame = null;
          return;
        }
        rainMotionCtx.clearRect(0, 0, rainMotionCanvas.width, rainMotionCanvas.height);
        rainMotionCtx.save();
        clipCanvasToCalamba(rainMotionCtx);
        rainMotionCtx.lineCap = 'round';
        var hours = rainHoursForTimeframe();
        for (var index = 0; index < rainParticles.length; index += 1) {
          var particle = rainParticles[index];
          var latlng = map.containerPointToLatLng([particle.x, particle.y]);
          var hourlyRate = Math.max(0, Number(rainAmountAt(latlng.lat, latlng.lng)) || 0) / hours;
          var visibilityRatio = Math.min(1, hourlyRate / 4);
          if (particle.y > rainMotionCanvas.height + 10 || !isWithinCalambaBoundary(latlng)) {
            resetRainParticle(particle, true);
            continue;
          }
          if (particle.threshold <= visibilityRatio) {
            rainMotionCtx.strokeStyle = 'rgba(219,234,254,' + (0.22 + visibilityRatio * 0.42) + ')';
            rainMotionCtx.lineWidth = hourlyRate >= 7.5 ? 1.35 : 0.9;
            rainMotionCtx.beginPath();
            rainMotionCtx.moveTo(particle.x - 1.2, particle.y - particle.length);
            rainMotionCtx.lineTo(particle.x, particle.y);
            rainMotionCtx.stroke();
          }
          particle.x += 0.28 + visibilityRatio * 0.5;
          particle.y += particle.speed + visibilityRatio * 1.7;
        }
        rainMotionCtx.restore();
        rainAnimationFrame = requestAnimationFrame(animateRainCanvas);
      }

      function renderRainAccumulationSurface() {
        if (!rainCtx || !rainCanvas) return;
        rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
        if (!Boolean(visibility.weatherOverlay) || focusModeActive) return;

        var samples = rainSamplesForMap();
        if (samples.length === 0) return;
        var forecastFrame = activeForecastFrame();
        var hasForecastGrid = Boolean(forecastFrame && Array.isArray(forecastFrame.points) && forecastFrame.points.length > 0);

        var scale = 4;
        var width = Math.max(1, Math.ceil(rainCanvas.width / scale));
        var height = Math.max(1, Math.ceil(rainCanvas.height / scale));
        var fieldCanvas = document.createElement('canvas');
        fieldCanvas.width = width;
        fieldCanvas.height = height;
        var fieldCtx = fieldCanvas.getContext('2d');
        if (!fieldCtx) return;
        var pixels = fieldCtx.createImageData(width, height);

        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            var px = x * scale;
            var py = y * scale;
            var value = 0;
            if (hasForecastGrid) {
              var latlng = map.containerPointToLatLng([px, py]);
              value = Math.max(0, Number(rainAmountAt(latlng.lat, latlng.lng)) || 0);
            } else {
              var weightedValue = 0;
              var totalWeight = 0;
              for (var s = 0; s < samples.length; s += 1) {
                var dx = px - samples[s].x;
                var dy = py - samples[s].y;
                var distanceSq = dx * dx + dy * dy;
                var weight = 1 / Math.pow(distanceSq + 900, 1.15);
                weightedValue += samples[s].value * weight;
                totalWeight += weight;
              }
              value = totalWeight > 0 ? weightedValue / totalWeight : 0;
            }
            var color = interpolateRainColor(value);
            var offset = (y * width + x) * 4;
            pixels.data[offset] = color[0];
            pixels.data[offset + 1] = color[1];
            pixels.data[offset + 2] = color[2];
            pixels.data[offset + 3] = color[3];
          }
        }
        fieldCtx.putImageData(pixels, 0, 0);

        var ring = payload.boundaryGeoJson && payload.boundaryGeoJson.features && payload.boundaryGeoJson.features[0]
          && payload.boundaryGeoJson.features[0].geometry && payload.boundaryGeoJson.features[0].geometry.coordinates
          ? payload.boundaryGeoJson.features[0].geometry.coordinates[0]
          : null;
        rainCtx.save();
        if (Array.isArray(ring) && ring.length >= 4) {
          rainCtx.beginPath();
          ring.forEach(function(coord, index) {
            var point = map.latLngToContainerPoint([Number(coord[1]), Number(coord[0])]);
            if (index === 0) rainCtx.moveTo(point.x, point.y);
            else rainCtx.lineTo(point.x, point.y);
          });
          rainCtx.closePath();
          rainCtx.clip();
        }
        rainCtx.imageSmoothingEnabled = true;
        rainCtx.filter = 'blur(3px) saturate(1.12)';
        rainCtx.drawImage(fieldCanvas, 0, 0, rainCanvas.width, rainCanvas.height);
        rainCtx.filter = 'none';
        rainCtx.restore();
      }

      function updateRainEffectVisibility() {
        ensureRainCanvas();
        if (!rainCanvas) {
          return;
        }

        var enabled = Boolean(visibility.weatherOverlay);
        if (enabled) {
          rainCanvas.style.display = 'block';
          if (rainMotionCanvas) rainMotionCanvas.style.display = 'block';
          requestAnimationFrame(function() { rainCanvas.style.opacity = '0.5'; });
        } else {
          rainCanvas.style.opacity = '0';
          setTimeout(function() {
            if (!Boolean(visibility.weatherOverlay)) rainCanvas.style.display = 'none';
            if (!Boolean(visibility.weatherOverlay) && rainMotionCanvas) rainMotionCanvas.style.display = 'none';
          }, 300);
        }
        updateWeatherHud();
        if (!enabled) {
          if (rainCtx) {
            rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
          }
          if (rainAnimationFrame) cancelAnimationFrame(rainAnimationFrame);
          rainAnimationFrame = null;
          if (rainMotionCtx && rainMotionCanvas) rainMotionCtx.clearRect(0, 0, rainMotionCanvas.width, rainMotionCanvas.height);
          return;
        }
        renderRainAccumulationSurface();
        if (rainParticles.length === 0) seedRainParticles();
        if (!rainAnimationFrame) animateRainCanvas();
      }

      function setRainIntensityFromMmPerHour(rainMmPerHour) {
        if (!map || !map._loaded) {
          map.whenReady(function() {
            setRainIntensityFromMmPerHour(rainMmPerHour);
          });
          return;
        }

        ensureRainCanvas();
        if (!rainCanvas) {
          return;
        }

        updateWeatherHud();
        updateRainEffectVisibility();
      }

      var windColorStops = [
        { value: 0, color: [82, 111, 208, 218] },
        { value: 5, color: [45, 174, 224, 224] },
        { value: 10, color: [41, 210, 135, 228] },
        { value: 20, color: [155, 209, 79, 232] },
        { value: 30, color: [239, 164, 71, 236] },
        { value: 40, color: [211, 72, 145, 240] },
        { value: 60, color: [139, 73, 181, 242] },
      ];

      function ensureWindCanvas() {
        if (windCanvas) return;
        windCanvas = document.createElement('canvas');
        windCanvas.className = 'map-wind-canvas';
        windCanvas.style.display = 'none';
        weatherSurfacePane.appendChild(windCanvas);
        windCtx = windCanvas.getContext('2d');
        windHud = document.createElement('div');
        windHud.className = 'wind-live-hud';
        map.getContainer().appendChild(windHud);
        refreshWindCanvasSize();
      }

      function interpolateWindColor(value) {
        var speed = Math.max(0, Number(value) || 0);
        for (var i = 1; i < windColorStops.length; i += 1) {
          var left = windColorStops[i - 1];
          var right = windColorStops[i];
          if (speed <= right.value) {
            var mix = (speed - left.value) / Math.max(0.0001, right.value - left.value);
            return left.color.map(function(channel, index) {
              return Math.round(channel + (right.color[index] - channel) * Math.max(0, Math.min(1, mix)));
            });
          }
        }
        return windColorStops[windColorStops.length - 1].color.slice();
      }

      function windVectorAt(lat, lon) {
        if (!windFieldData || !Array.isArray(windFieldData.points) || windFieldData.points.length === 0) return null;
        var bounds = windFieldData.bounds || {};
        var rows = Math.max(2, Number(windFieldData.rows) || 2);
        var cols = Math.max(2, Number(windFieldData.cols) || 2);
        var latSpan = Math.max(0.000001, Number(bounds.latMax) - Number(bounds.latMin));
        var lonSpan = Math.max(0.000001, Number(bounds.lonMax) - Number(bounds.lonMin));
        var rowFloat = Math.max(0, Math.min(rows - 1, ((Number(bounds.latMax) - lat) / latSpan) * (rows - 1)));
        var colFloat = Math.max(0, Math.min(cols - 1, ((lon - Number(bounds.lonMin)) / lonSpan) * (cols - 1)));
        var row0 = Math.floor(rowFloat);
        var row1 = Math.min(rows - 1, row0 + 1);
        var col0 = Math.floor(colFloat);
        var col1 = Math.min(cols - 1, col0 + 1);
        var rowMix = rowFloat - row0;
        var colMix = colFloat - col0;

        function at(row, col) {
          return windFieldData.points[row * cols + col] || { u: 0, v: 0 };
        }
        var topLeft = at(row0, col0);
        var topRight = at(row0, col1);
        var bottomLeft = at(row1, col0);
        var bottomRight = at(row1, col1);
        var topU = Number(topLeft.u) + (Number(topRight.u) - Number(topLeft.u)) * colMix;
        var topV = Number(topLeft.v) + (Number(topRight.v) - Number(topLeft.v)) * colMix;
        var bottomU = Number(bottomLeft.u) + (Number(bottomRight.u) - Number(bottomLeft.u)) * colMix;
        var bottomV = Number(bottomLeft.v) + (Number(bottomRight.v) - Number(bottomLeft.v)) * colMix;
        var u = topU + (bottomU - topU) * rowMix;
        var v = topV + (bottomV - topV) * rowMix;
        return { u: u, v: v, speedKph: Math.sqrt(u * u + v * v) * 3.6 };
      }

      function buildFallbackWindField(speedKph, directionDegrees) {
        var baseSpeedKph = Number(speedKph);
        if (!Number.isFinite(baseSpeedKph) || baseSpeedKph < 0) baseSpeedKph = 8;
        var baseDirection = Number(directionDegrees);
        if (!Number.isFinite(baseDirection)) baseDirection = 225;
        var rows = 4;
        var cols = 5;
        var points = [];
        for (var row = 0; row < rows; row += 1) {
          var latitude = 14.2662133 - ((14.2662133 - 14.137703) * row) / (rows - 1);
          for (var col = 0; col < cols; col += 1) {
            var longitude = 121.0218057 + ((121.2214277 - 121.0218057) * col) / (cols - 1);
            var localSpeedKph = Math.max(0, baseSpeedKph);
            var localDirection = baseDirection;
            var towardRadians = (localDirection + 180) * Math.PI / 180;
            var speedMetersPerSecond = localSpeedKph / 3.6;
            points.push({
              row: row,
              col: col,
              latitude: latitude,
              longitude: longitude,
              u: Math.sin(towardRadians) * speedMetersPerSecond,
              v: Math.cos(towardRadians) * speedMetersPerSecond,
              speedKph: localSpeedKph,
            });
          }
        }
        return {
          source: 'Open-Meteo city weather',
          model: 'surface',
          level: 'surface',
          updatedAt: new Date().toISOString(),
          averageSpeedKph: baseSpeedKph,
          rows: rows,
          cols: cols,
          bounds: { latMin: 14.137703, latMax: 14.2662133, lonMin: 121.0218057, lonMax: 121.2214277 },
          points: points,
        };
      }

      function applyFallbackWindField(speedKph, directionDegrees) {
        if (windFieldData && windFieldData.source === 'Open-Meteo') return;
        windFieldData = buildFallbackWindField(speedKph, directionDegrees);
        if (Boolean(visibility.windOverlay)) {
          refreshWindCanvasSize();
          updateWindEffectVisibility();
        }
      }

      function clipCanvasToCalamba(context) {
        var ring = payload.boundaryGeoJson && payload.boundaryGeoJson.features && payload.boundaryGeoJson.features[0]
          && payload.boundaryGeoJson.features[0].geometry && payload.boundaryGeoJson.features[0].geometry.coordinates
          ? payload.boundaryGeoJson.features[0].geometry.coordinates[0]
          : null;
        if (!Array.isArray(ring) || ring.length < 4) return false;
        context.beginPath();
        ring.forEach(function(coord, index) {
          var point = map.latLngToContainerPoint([Number(coord[1]), Number(coord[0])]);
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.clip();
        return true;
      }

      function renderWindBackground() {
        if (!windCanvas || !windCtx || !windFieldData) return;
        var scale = 4;
        var width = Math.max(1, Math.ceil(windCanvas.width / scale));
        var height = Math.max(1, Math.ceil(windCanvas.height / scale));
        windBackgroundCanvas = document.createElement('canvas');
        windBackgroundCanvas.width = windCanvas.width;
        windBackgroundCanvas.height = windCanvas.height;
        var lowCanvas = document.createElement('canvas');
        lowCanvas.width = width;
        lowCanvas.height = height;
        var lowCtx = lowCanvas.getContext('2d');
        var backgroundCtx = windBackgroundCanvas.getContext('2d');
        if (!lowCtx || !backgroundCtx) return;
        var pixels = lowCtx.createImageData(width, height);
        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            var latlng = map.containerPointToLatLng([x * scale, y * scale]);
            var vector = windVectorAt(latlng.lat, latlng.lng) || { speedKph: 0 };
            var color = interpolateWindColor(vector.speedKph);
            var offset = (y * width + x) * 4;
            pixels.data[offset] = color[0];
            pixels.data[offset + 1] = color[1];
            pixels.data[offset + 2] = color[2];
            pixels.data[offset + 3] = color[3];
          }
        }
        lowCtx.putImageData(pixels, 0, 0);
        backgroundCtx.save();
        clipCanvasToCalamba(backgroundCtx);
        backgroundCtx.imageSmoothingEnabled = true;
        backgroundCtx.drawImage(lowCanvas, 0, 0, windCanvas.width, windCanvas.height);
        backgroundCtx.restore();
      }

      function resetWindParticle(particle, randomAge) {
        if (!windCanvas) return;
        var tries = 0;
        do {
          particle.x = Math.random() * windCanvas.width;
          particle.y = Math.random() * windCanvas.height;
          tries += 1;
        } while (tries < 14 && !isWithinCalambaBoundary(map.containerPointToLatLng([particle.x, particle.y])));
        particle.age = randomAge ? Math.floor(Math.random() * particle.life) : 0;
      }

      function seedWindParticles() {
        if (!windCanvas) return;
        var count = Math.max(300, Math.min(820, Math.round((windCanvas.width * windCanvas.height) / 720)));
        windParticles = [];
        for (var i = 0; i < count; i += 1) {
          var particle = { x: 0, y: 0, age: 0, life: 42 + Math.floor(Math.random() * 54) };
          resetWindParticle(particle, true);
          windParticles.push(particle);
        }
      }

      function animateWindCanvas() {
        if (!windCanvas || !windCtx || !Boolean(visibility.windOverlay) || !windFieldData) {
          windAnimationFrame = null;
          return;
        }
        windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);
        if (windBackgroundCanvas) windCtx.drawImage(windBackgroundCanvas, 0, 0);
        windCtx.save();
        clipCanvasToCalamba(windCtx);
        windCtx.lineCap = 'round';
        for (var i = 0; i < windParticles.length; i += 1) {
          var particle = windParticles[i];
          var latlng = map.containerPointToLatLng([particle.x, particle.y]);
          var vector = windVectorAt(latlng.lat, latlng.lng);
          if (!vector || !isWithinCalambaBoundary(latlng) || particle.age >= particle.life) {
            resetWindParticle(particle, false);
            continue;
          }
          var motionScale = 0.42 + Math.min(1.5, vector.speedKph / 28);
          var vx = vector.u * motionScale;
          var vy = -vector.v * motionScale;
          var tailScale = 6 + Math.min(9, vector.speedKph / 2.8);
          var ageFade = Math.min(1, particle.age / 8) * Math.min(1, (particle.life - particle.age) / 12);
          windCtx.strokeStyle = 'rgba(255,255,255,' + (0.52 + ageFade * 0.42) + ')';
          windCtx.lineWidth = vector.speedKph >= 35 ? 1.7 : 1.25;
          windCtx.beginPath();
          windCtx.moveTo(particle.x - vx * tailScale, particle.y - vy * tailScale);
          windCtx.lineTo(particle.x, particle.y);
          windCtx.stroke();
          particle.x += vx;
          particle.y += vy;
          particle.age += 1;
        }
        windCtx.restore();
        windAnimationFrame = requestAnimationFrame(animateWindCanvas);
      }

      function refreshWindCanvasSize() {
        ensureWindCanvas();
        if (!windCanvas) return;
        var size = map.getSize();
        L.DomUtil.setPosition(windCanvas, map.containerPointToLayerPoint([0, 0]));
        windCanvas.width = Math.max(1, Number(size.x) || 1);
        windCanvas.height = Math.max(1, Number(size.y) || 1);
        if (windFieldData) {
          renderWindBackground();
          seedWindParticles();
        }
      }

      function updateWindHud(errorMessage) {
        if (!windHud) return;
        if (!Boolean(visibility.windOverlay)) {
          windHud.style.display = 'none';
          return;
        }
        windHud.style.display = 'block';
        if (errorMessage) {
          windHud.classList.add('wind-error');
          windHud.textContent = errorMessage;
          return;
        }
        windHud.classList.remove('wind-error');
        if (!windFieldData) {
          windHud.textContent = 'Loading wind field...';
          return;
        }
        var sourceLabel = windFieldData.source === 'Open-Meteo' ? 'Source: Open-Meteo' : 'Surface wind';
        windHud.innerHTML = '<span class="wind-source">WIND</span> &nbsp; ' + Number(windFieldData.averageSpeedKph || 0).toFixed(0) + ' km/h average &nbsp; ' + sourceLabel;
      }

      function updateWindEffectVisibility() {
        ensureForecastTimebar();
        ensureWindCanvas();
        if (!windCanvas) return;
        var enabled = Boolean(visibility.windOverlay) && !focusModeActive;
        if (enabled && !windFieldData) {
          windFieldData = buildFallbackWindField(8, 225);
        }
        windCanvas.style.display = enabled ? 'block' : 'none';
        updateWindHud();
        updateForecastTimebar();
        if (!enabled) {
          if (windAnimationFrame) cancelAnimationFrame(windAnimationFrame);
          windAnimationFrame = null;
          if (windCtx) windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);
          return;
        }
        renderWindBackground();
        if (windParticles.length === 0) seedWindParticles();
        if (!windAnimationFrame) animateWindCanvas();
      }

      function loadWindFieldData() {
        if (!payload.windDataUrl || windLoadState === 'loading') return;
        windLoadState = 'loading';
        updateWindHud();
        fetch(payload.windDataUrl)
          .then(function(response) {
            return response.json().then(function(data) {
              if (!response.ok) throw new Error(data && data.message ? data.message : 'Wind data request failed.');
              return data;
            });
          })
          .then(function(data) {
            weatherTimelineData = data;
            windFieldData = data && data.frames && data.frames[weatherTimeframe]
              ? data.frames[weatherTimeframe]
              : data;
            windLoadState = 'ready';
            refreshRainCanvasSize();
            refreshWindCanvasSize();
            updateRainEffectVisibility();
            updateWindEffectVisibility();
            updateForecastTimebar();
            renderLegendControl();
          })
          .catch(function(error) {
            windLoadState = 'error';
            updateWindHud('Open-Meteo forecast is temporarily unavailable.');
            updateForecastTimebar();
          });
      }

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
        // Western and south-western Calamba trend toward Mt. Makiling foothills (higher terrain).
        if (lon <= 121.10 && lat <= 14.22) {
          return 'upland';
        }
        // Eastern Calamba trends toward Laguna de Bay shoreline and floodplain (lower terrain).
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
        var reason = 'Elevated or farther from major water channels.';

        if (shorelineDistance <= 350 || waterDistance <= 100 || terrainBand === 'lowland') {
          risk = 'HIGH';
          reason = 'Near lake shoreline/river corridor or in low-lying floodplain terrain.';
        } else if (waterDistance <= 300 || (shorelineDistance <= 700 && terrainBand !== 'upland') || terrainBand === 'midland') {
          risk = 'MODERATE';
          reason = 'Moderate distance from waterways with terrain that can accumulate runoff.';
        }

        if (terrainBand === 'upland' && waterDistance > 300 && shorelineDistance > 900) {
          risk = 'LOW';
          reason = 'Upland/foothill setting and farther from lake and river influence.';
        }

        return {
          risk: risk,
          reason: reason,
          waterDistance: Number.isFinite(waterDistance) ? Math.round(waterDistance) : null,
          shorelineDistance: Number.isFinite(shorelineDistance) ? Math.round(shorelineDistance) : null,
          terrainBand: terrainBand,
        };
      }

      function loadOsmWaterways() {
        if (waterwaysState.status === 'loading' || waterwaysState.status === 'ready') {
          return;
        }

        waterwaysState.status = 'loading';

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

        var query =
          '[out:json][timeout:20];' +
          '(' +
            'way["waterway"~"river|stream|canal|drain"](14.137703,121.0218057,14.2662133,121.2214277);' +
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
        L.geoJSON(payload.boundaryGeoJson, {
          style: function() {
            return {
              color: '#111111',
              weight: 3,
              fillOpacity: 0,
            };
          }
        }).addTo(boundaryLayer);
      }

      function normalizeBarangayName(value) {
        return String(value || '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      }

      function buildLegendHtml() {
        var updated = lastLegendUpdatedAt
          ? new Date(lastLegendUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '-';
        var weatherOn = Boolean(visibility.weatherOverlay);
        var floodOn = Boolean(visibility.floodHazard);
        var windOn = Boolean(visibility.windOverlay);
        var forecastFrame = activeForecastFrame() || {};

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
              escapeHtml(String(forecastFrame.rainWindow || 'Rain accumulation')) + ' (mm)' +
            '</div>' +
            '<div style="height:10px;border-radius:999px;margin:6px 0 3px;background:linear-gradient(90deg,#2365eb 0%,#10c6f4 18%,#29ee8f 38%,#aff738 56%,#ffd62a 72%,#ff7514 87%,#c4190c 100%);"></div>' +
            '<div style="display:flex;justify-content:space-between;color:#475569;font-size:9px;"><span>3</span><span>10</span><span>25</span><span>100</span><span>300</span></div>';
        }

        var windSection = '';
        if (windOn) {
          windSection =
            '<div class="legend-section-label" style="margin-top:' + (floodOn || weatherOn ? '6px' : '0') + '">' +
              '<span class="legend-section-dot" style="background:#facc15;"></span>' +
              'Wind speed - ' + escapeHtml(String(forecastFrame.label || 'Current')) + ' (km/h)' +
            '</div>' +
            '<div style="height:10px;border-radius:999px;margin:6px 0 3px;background:linear-gradient(90deg,#526fd0 0%,#2daee0 18%,#29d287 36%,#9bd14f 54%,#efa447 72%,#d34891 88%,#8b49b5 100%);"></div>' +
            '<div style="display:flex;justify-content:space-between;color:#475569;font-size:9px;"><span>0</span><span>5</span><span>10</span><span>20</span><span>30</span><span>40</span><span>60</span></div>' +
            '<div class="updated">White particles show wind direction.</div>';
        }

        var noLayers = !floodOn && !weatherOn && !windOn;

        return (
          '<div class="map-legend">' +
            '<div class="title">Map Legend</div>' +
            (noLayers
              ? '<div style="color:#64748b;font-size:10px;margin-top:4px;">Enable Flood Hazard or Live Weather layers to see color indicators.</div>'
              : (floodSection + rainSection + windSection)
            ) +
            (floodOn && !weatherOn && !windOn ? '<div class="updated">Updated: ' + escapeHtml(updated) + '</div>' : '') +
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

      function resolveBarangayRiskColor(level) {
        var risk = String(level || '').trim().toUpperCase();
        if (risk === 'HIGH') {
          return '#dc2626';
        }
        if (risk === 'MEDIUM') {
          return '#eab308';
        }
        return '#16a34a';
      }

      function normalizeRiskLevel(level) {
        var value = String(level || '').trim().toUpperCase();
        if (value === 'HIGH') {
          return 'HIGH';
        }
        if (value === 'MEDIUM' || value === 'MODERATE') {
          return 'MEDIUM';
        }
        return 'LOW';
      }

      function resolveBarangayWeatherColor(baseRiskLevel, weatherImpact) {
        if (!Boolean(visibility.floodHazard)) {
          return '#111111';
        }
        return resolveBarangayRiskColor(baseRiskLevel);
      }

      function resolveRainFillColor(level) {
        var key = String(level || '').trim().toLowerCase();
        if (key === 'severe') {
          return '#dc2626'; // Red — >15 mm/hr
        }
        if (key === 'heavy') {
          return '#eab308'; // Yellow — >7.5–15 mm/hr
        }
        if (key === 'moderate') {
          return '#16a34a'; // Green — >2.5–7.5 mm/hr
        }
        return '#7dd3fc'; // Light Blue — 0–2.5 mm/hr (Light)
      }

      function buildBoundaryPopupHtml(props, weatherImpact) {
        var name = props.barangay_name || 'Barangay';
        var baseRisk = String(props.flood_risk_level || 'LOW').toUpperCase();
        if (!Boolean(visibility.weatherOverlay)) {
          return '<strong>' + name + '</strong><br/>' +
            'Baseline Flood Risk: ' + baseRisk + '<br/>' +
            'Live weather overlay is hidden.';
        }
        if (!weatherImpact) {
          return '<strong>' + name + '</strong><br/>' +
            'Baseline Flood Risk: ' + baseRisk + '<br/>' +
            'Weather: Awaiting live feed...';
        }

        var rainIntensity = Number(weatherImpact.rainIntensityMmPerHour || weatherImpact.averageRainfallMmPerHour || 0);
        var rainAccumulation = Math.max(0, rainIntensity * rainAccumulationHours).toFixed(1);
        return '<div class="weather-popup">' +
          '<div class="head">RAIN ACCUMULATION</div>' +
          '<strong>' + name + '</strong>' +
          '<table>' +
            '<tr><td>Next 24 hours</td><td>' + rainAccumulation + ' mm</td></tr>' +
            '<tr><td>Baseline Flood Risk</td><td>' + baseRisk + '</td></tr>' +
          '</table>' +
        '</div>';
      }

      function resolveBarangayBoundaryStyle(feature) {
        var props = feature && feature.properties ? feature.properties : {};
        var key = normalizeBarangayName(props.barangay_name);
        var weatherImpact = weatherImpactByBarangay[key] || null;
        var floodHazardVisible = Boolean(visibility.floodHazard);
        var selected = Boolean(selectedBarangayKey) && selectedBarangayKey === key;
        var focusColor = resolveBarangayRiskColor(focusedBarangayRiskLevel || props.flood_risk_level);

        if (focusModeActive) {
          return {
            color: focusColor,
            weight: 5,
            opacity: 1,
            fill: false,
            fillColor: '#000000',
            fillOpacity: 0,
          };
        }

        return {
          color: Boolean(visibility.weatherOverlay) || Boolean(visibility.windOverlay)
            ? (selected ? '#ffffff' : 'rgba(15,23,42,0.72)')
            : (selected ? '#60a5fa' : resolveBarangayWeatherColor(props.flood_risk_level, weatherImpact)),
          weight: selected ? 3.2 : (floodHazardVisible ? 3 : 1.45),
          opacity: 1,
          fill: false,
          fillColor: 'transparent',
          fillOpacity: 0,
        };
      }

      function selectBarangayByKey(key, openPopup) {
        if (!key) {
          return;
        }

        selectedBarangayKey = key;
        if (!focusModeActive) {
          focusedBarangayRiskLevel = null;
        }
        renderBarangayBoundaryLayer();

        if (openPopup) {
          var layer = barangayLayerByKey[key];
          if (layer && typeof layer.openPopup === 'function') {
            layer.openPopup();
          }
        }
      }

      function renderBarangayBoundaryLayer() {
        barangayBoundaryLayer.clearLayers();
        barangayLayerByKey = {};
        var source = latestBarangayGeoJsonData || barangayBoundaryGeoJsonData;
        if (!source) {
          return;
        }

        var filteredFeatures = Array.isArray(source.features)
          ? source.features.filter(function(feature) {
            if (!focusModeActive || !focusedBarangayKey) {
              return true;
            }
            var props = feature && feature.properties ? feature.properties : {};
            return normalizeBarangayName(props.barangay_name) === focusedBarangayKey;
          })
          : [];

        var nextSource = {
          type: 'FeatureCollection',
          features: filteredFeatures,
        };

        L.geoJSON(nextSource, {
          style: function(feature) {
            return resolveBarangayBoundaryStyle(feature);
          },
          onEachFeature: function(feature, layer) {
            var props = feature && feature.properties ? feature.properties : {};
            var name = props.barangay_name || 'Barangay';
            var key = normalizeBarangayName(name);
            var weatherImpact = weatherImpactByBarangay[key] || null;
            layer.bindTooltip(name, { sticky: true });
            if (!Boolean(visibility.weatherOverlay) && !Boolean(visibility.windOverlay)) {
              layer.bindPopup(buildBoundaryPopupHtml(props, weatherImpact));
            }
            barangayLayerByKey[key] = layer;
            layer.on('click', function() {
              selectBarangayByKey(key, false);
            });
          },
        }).addTo(barangayBoundaryLayer);

        if (pendingFocusFit && focusModeActive && focusedBarangayKey) {
          var selectedLayer = barangayLayerByKey[focusedBarangayKey];
          var layerBounds = selectedLayer && typeof selectedLayer.getBounds === 'function' ? selectedLayer.getBounds() : null;
          if (layerBounds && layerBounds.isValid()) {
            map.fitBounds(layerBounds.pad(0.2), { maxZoom: 15 });
          }
          pendingFocusFit = false;
        }
      }

      function renderWeatherFillLayer() {
        renderRainAccumulationSurface();
      }

      function renderFloodHazardLayer() {
        floodHazardLayer.clearLayers();
        // Flood hazard is shown via colored barangay boundaries only.
        // No interior raster shading is rendered for this layer.
      }

      function renderBarangayBoundaries() {
        if (!payload.barangayBoundaryGeoJsonUrl) {
          return;
        }

        if (latestBarangayGeoJsonData) {
          renderBarangayBoundaryLayer();
          return;
        }

        fetch(payload.barangayBoundaryGeoJsonUrl)
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Barangay boundary request failed');
            }
            return response.json();
          })
          .then(function(data) {
            barangayBoundaryGeoJsonData = data;
            latestBarangayGeoJsonData = data;
            renderBarangayBoundaryLayer();
          })
          .catch(function() {
            // Keep map functional if boundary data cannot be fetched.
          });
      }

      function clearCityAlert() {
        if (cityAlertControl) {
          map.removeControl(cityAlertControl);
          cityAlertControl = null;
        }
      }

      var TYPHOON_DISMISSED_KEY = 'cdrrmd_typhoon_alert_dismissed';

      function renderCityAlert(text, alertId) {
        // Only show once per session — if dismissed, never show again until page reload.
        var dismissedId = null;
        try { dismissedId = sessionStorage.getItem(TYPHOON_DISMISSED_KEY); } catch(e) {}
        if (dismissedId && dismissedId === String(alertId || 'typhoon')) {
          return;
        }
        // Already showing the same alert? Don't re-render.
        if (cityAlertControl) {
          return;
        }
        cityAlertControl = L.control({ position: 'topright' });
        cityAlertControl.onAdd = function() {
          var wrap = L.DomUtil.create('div', 'city-alert-banner-wrap');
          var closeButton = L.DomUtil.create('button', 'city-alert-close', wrap);
          closeButton.type = 'button';
          closeButton.textContent = 'x';

          var banner = L.DomUtil.create('div', 'city-alert-banner', wrap);
          banner.textContent = text;

          L.DomEvent.disableClickPropagation(wrap);
          L.DomEvent.on(closeButton, 'click', function(event) {
            L.DomEvent.stopPropagation(event);
            // Persist dismissal for the whole session so it never re-appears.
            try { sessionStorage.setItem(TYPHOON_DISMISSED_KEY, String(alertId || 'typhoon')); } catch(e) {}
            clearCityAlert();
          });

          return wrap;
        };
        cityAlertControl.addTo(map);
      }

      function refreshRainImpactData() {
        if (!payload.rainImpactUrl) {
          return;
        }

        fetch(payload.rainImpactUrl)
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Rain impact request failed');
            }
            return response.json();
          })
          .then(function(data) {
            lastLegendUpdatedAt = data && data.updatedAt ? data.updatedAt : new Date().toISOString();
            var impacts = Array.isArray(data && data.barangayImpacts) ? data.barangayImpacts : [];
            var hasActiveRain = impacts.some(function(item) {
              var rain = Number(item && item.rainIntensityMmPerHour);
              return Number.isFinite(rain) && rain > ${MIN_ACTIVE_RAIN_MM_PER_HOUR};
            });
            var nextLookup = {};
            impacts.forEach(function(item) {
              var key = normalizeBarangayName(item && item.barangayName);
              if (!key) {
                return;
              }
              var rainValue = Number(item && item.rainIntensityMmPerHour);
              nextLookup[key] = {
                rainLevel: item.rainLevel,
                rainIntensityMmPerHour: Number.isFinite(rainValue) ? rainValue : 0,
                averageRainfallMmPerHour: item.averageRainfallMmPerHour,
                stormRisk: item.stormRisk,
                temperatureCelsius: item.temperatureCelsius,
                thunderstormProbabilityPct: item.thunderstormProbabilityPct,
                typhoonForecastImpact: item.typhoonForecastImpact,
              };
            });
            weatherImpactByBarangay = nextLookup;
            if (data && data.barangayOverlay && Array.isArray(data.barangayOverlay.features)) {
              weatherFillGeoJsonData = {
                type: 'FeatureCollection',
                features: data.barangayOverlay.features.filter(function(feature) {
                  var props = feature && feature.properties ? feature.properties : {};
                  var key = normalizeBarangayName(props.barangay_name || props.barangayName || props.name);
                  return Boolean(weatherImpactByBarangay[key]);
                }),
              };
            } else {
              weatherFillGeoJsonData = null;
            }
            cityRainIntensityMmPerHour = Number(data && data.cityWeather && data.cityWeather.rainIntensityMmPerHour);
            if (!Number.isFinite(cityRainIntensityMmPerHour)) {
              cityRainIntensityMmPerHour = 0;
            }
            var cityWeather = data && data.cityWeather ? data.cityWeather : {};
            applyFallbackWindField(cityWeather.windSpeedKph, cityWeather.windDirectionDegrees);
            setRainIntensityFromMmPerHour(cityRainIntensityMmPerHour);
            renderBarangayBoundaryLayer();
            renderWeatherFillLayer();

            cityWeather = data && data.cityWeather ? data.cityWeather : null;
            var cityAlert = cityWeather && cityWeather.cityWideTyphoonAlert ? cityWeather.cityWideTyphoonAlert : null;
            // Only show typhoon alert when: active flag is true AND city-wide impact is confirmed AND there is actual rainfall.
            // alertId is derived from the message so it stays stable across refreshes.
            var typhoonActive = cityAlert && cityAlert.active === true && hasActiveRain &&
              (cityAlert.cityWideImpact === true || cityAlert.cityWide === true ||
               String(cityAlert.scope || '').toLowerCase().indexOf('city') !== -1 ||
               String(cityAlert.message || '').toLowerCase().indexOf('city') !== -1);
            if (typhoonActive) {
              var alertMsg = 'CITY-WIDE TYPHOON ALERT: ' + String(cityAlert.message || 'Typhoon path confirmed to impact all Calamba City barangays. Immediate city-wide preparedness required.');
              var alertId = String(cityAlert.id || cityAlert.message || 'typhoon').slice(0, 64);
              renderCityAlert(alertMsg, alertId);
            } else {
              clearCityAlert();
            }

            applyLayerVisibility();
            renderLegendControl();
          })
          .catch(function() {
            clearCityAlert();
            setRainIntensityFromMmPerHour(0);
          });
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

      function renderIncidents() {
        incidentLayer.clearLayers();
        (payload.incidentPoints || []).forEach(function(point) {
          var lat = Number(point.latitude);
          var lon = Number(point.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inCalamba(lat, lon)) {
            return;
          }
          fitBounds.extend([lat, lon]);
          L.circleMarker([lat, lon], {
            radius: 5,
            color: '#fff',
            weight: 2,
            fillColor: '#2563eb',
            fillOpacity: 0.95,
          }).addTo(incidentLayer).bindPopup(
            '<strong>' + (point.reportCode || 'Incident') + '</strong><br/>' +
            'Type: ' + (point.reportType || 'incident') + '<br/>' +
            'Status: ' + (point.status || 'pending')
          );
        });
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
        applyBasemap();

        var showBoundary = focusModeActive ? false : Boolean(visibility.boundary);
        var showFloodHazard = focusModeActive ? false : Boolean(visibility.floodHazard);
        var showBarangayBoundary = focusModeActive ? true : Boolean(visibility.boundary);
        var showAreas = focusModeActive ? false : Boolean(visibility.evacuationAreas);
        var showIncidents = focusModeActive ? false : Boolean(visibility.incidentMarkers);
        var showResponderRoute = focusModeActive ? false : Boolean(visibility.responderRoute);

        setLayerVisible(boundaryLayer, showBoundary);
        setLayerVisible(floodHazardLayer, showFloodHazard);
        setLayerVisible(barangayBoundaryLayer, showBarangayBoundary);
        renderBarangayBoundaryLayer();
        renderWeatherFillLayer();
        setLayerVisible(areaLayer, showAreas);
        setLayerVisible(incidentLayer, showIncidents);
        setLayerVisible(responderRouteLayer, showResponderRoute);

        if (focusModeActive) {
          if (rainCanvas) {
            rainCanvas.style.display = 'none';
          }
          if (rainMotionCanvas) {
            rainMotionCanvas.style.display = 'none';
          }
          if (windCanvas) {
            windCanvas.style.display = 'none';
          }
          if (windHud) {
            windHud.style.display = 'none';
          }
          if (windAnimationFrame) {
            cancelAnimationFrame(windAnimationFrame);
            windAnimationFrame = null;
          }
          if (rainAnimationFrame) {
            cancelAnimationFrame(rainAnimationFrame);
            rainAnimationFrame = null;
          }
          if (rainCtx && rainCanvas) {
            rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
          }
        } else {
          updateRainEffectVisibility();
          updateWindEffectVisibility();
        }

        renderLegendControl();
      }

      var areaPinIcon = L.divIcon({
        className: 'evac-pin',
        html: '<div style="width:16px;height:16px;background:#e11d48;border:3px solid #fff;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      (payload.areas || []).forEach(function(area) {
        var lat = Number(area.latitude);
        var lon = Number(area.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inCalamba(lat, lon)) {
          return;
        }
        fitBounds.extend([lat, lon]);
        L.marker([lat, lon], { icon: areaPinIcon })
          .addTo(areaLayer)
          .bindPopup(
            '<strong>' + area.name + '</strong><br/>' +
            area.barangay + '<br/>' +
            'Capacity: ' + area.capacity + '<br/>' +
            'Evacuees: ' + area.evacuees + '<br/>' +
            'Status: ' + (area.evacuation_status === 'full' ? 'Full' : (area.evacuation_status === 'nearly_full' ? 'Nearly Full' : 'Available'))
          );
      });

      if (payload.incidentLocation && inCalamba(Number(payload.incidentLocation.latitude), Number(payload.incidentLocation.longitude))) {
        fitBounds.extend([payload.incidentLocation.latitude, payload.incidentLocation.longitude]);
        L.circleMarker([payload.incidentLocation.latitude, payload.incidentLocation.longitude], {
          radius: 9,
          color: '#ffffff',
          weight: 2,
          fillColor: '#dc2626',
          fillOpacity: 0.95,
        }).addTo(responderRouteLayer).bindPopup('<strong>Selected incident</strong><br/>' + (payload.selectedReportCode || 'Rescue report'));
      }

      if (payload.responderLocation && inCalamba(Number(payload.responderLocation.latitude), Number(payload.responderLocation.longitude))) {
        fitBounds.extend([payload.responderLocation.latitude, payload.responderLocation.longitude]);
        L.circleMarker([payload.responderLocation.latitude, payload.responderLocation.longitude], {
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: '#0ea5e9',
          fillOpacity: 1,
        }).addTo(responderRouteLayer).bindPopup('<strong>Closest responder base</strong>');
      }

      if ((payload.routeCoordinates || []).length > 1) {
        var line = payload.routeCoordinates
          .map(function(point) { return [Number(point.latitude), Number(point.longitude)]; })
          .filter(function(point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]) && inCalamba(point[0], point[1]); });
        if (line.length > 1) {
          line.forEach(function(p) { fitBounds.extend(p); });
          L.polyline(line, { color: '#22c55e', weight: 6, opacity: 0.8 }).addTo(responderRouteLayer);
        }
      }

      // In-map layer control (top-right)
      var layerPanelControl = null;
      var layerPanelOpen = false;

      // SVG icons per layer — inline SVG strings
      var LAYER_ICONS = {
        boundary:        '<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-dasharray="2 2"/></svg>',
        floodHazard:     '<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><path d="M2 17c1.5-2 3-3 5-3s3.5 2 5 2 3.5-2 5-2 3.5 1 5 3"/><path d="M2 12c1.5-2 3-3 5-3s3.5 2 5 2 3.5-2 5-2 3.5 1 5 3"/><path d="M12 3 C10 6 7 8 7 11" stroke="#93c5fd"/></svg>',
        evacuationAreas: '<svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
        incidentMarkers: '<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        responderRoute:  '<svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><path d="M3 12 C3 7 7 4 12 4 C17 4 21 7 21 12" stroke-dasharray="3 2"/><polyline points="17 12 21 12 21 16"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></svg>',
        weatherOverlay:  '<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
        windOverlay:     '<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="layer-icon-svg"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h8"/></svg>',
      };

      var LAYER_DEFS = [
        { key: 'boundary',        label: 'Boundary' },
        { key: 'floodHazard',     label: 'Flood Hazard' },
        { key: 'evacuationAreas', label: 'Evacuation' },
        { key: 'incidentMarkers', label: 'Incidents' },
        { key: 'responderRoute',  label: 'Route' },
        { key: 'weatherOverlay',  label: 'Rain accumulation' },
        { key: 'windOverlay',     label: 'Wind' },
      ];

      function renderLayerPanelControl() {
        if (layerPanelControl) {
          map.removeControl(layerPanelControl);
          layerPanelControl = null;
        }

        layerPanelControl = L.control({ position: 'topright' });
        layerPanelControl.onAdd = function() {
          var container = L.DomUtil.create('div', 'layer-ctrl-wrap');
          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);

          // Collapsed toggle button — just icon + label
          var btn = L.DomUtil.create('button', 'layer-ctrl-btn', container);
          btn.type = 'button';
          btn.title = 'Map Layers';
          btn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polygon points="12 2 2 7 12 12 22 7 12 2"/>' +
              '<polyline points="2 17 12 22 22 17"/>' +
              '<polyline points="2 12 12 17 22 12"/>' +
            '</svg>' +
            '<span style="font-size:12px;font-weight:700;">Layers</span>';

          // Expanded panel — icon grid
          var panel = L.DomUtil.create('div', 'layer-ctrl-panel' + (layerPanelOpen ? ' layer-ctrl-panel-open' : ''), container);

          var title = L.DomUtil.create('div', 'layer-ctrl-title', panel);
          title.textContent = 'Map Layers';

          // Icon grid container
          var grid = L.DomUtil.create('div', 'layer-icon-grid', panel);

          LAYER_DEFS.forEach(function(def) {
            var isOn = Boolean(visibility[def.key]);
            var item = L.DomUtil.create('div', 'layer-icon-item' + (isOn ? ' layer-icon-on' : ''), grid);
            item.dataset.key = def.key;
            item.title = def.label;
            item.innerHTML = (LAYER_ICONS[def.key] || '') +
              '<span class="layer-icon-label">' + def.label + '</span>';

            L.DomEvent.on(item, 'click', function() {
              var key = def.key;
              visibility[key] = !visibility[key];
              var nowOn = Boolean(visibility[key]);

              // Mutual exclusion: weather overlay ↔ flood hazard
              if (key === 'weatherOverlay' && nowOn) {
                visibility.floodHazard = false;
                visibility.windOverlay = false;
              } else if (key === 'floodHazard' && nowOn) {
                visibility.weatherOverlay = false;
                visibility.windOverlay = false;
              } else if (key === 'windOverlay' && nowOn) {
                visibility.weatherOverlay = false;
                visibility.floodHazard = false;
              }

              // Re-render all icon states
              grid.querySelectorAll('.layer-icon-item').forEach(function(el) {
                var k = el.dataset.key;
                if (Boolean(visibility[k])) {
                  el.classList.add('layer-icon-on');
                } else {
                  el.classList.remove('layer-icon-on');
                }
              });

              applyLayerVisibility();
              if ((key === 'weatherOverlay' || key === 'windOverlay') && nowOn && map.getZoom() < 12) {
                map.flyTo(calambaCenter, 12, { duration: 0.45 });
              }
              if (Boolean(visibility.weatherOverlay)) {
                refreshRainImpactData();
              }
              if (Boolean(visibility.weatherOverlay) || Boolean(visibility.windOverlay)) {
                loadWindFieldData();
              }
            });
          });

          L.DomEvent.on(btn, 'click', function(e) {
            L.DomEvent.stopPropagation(e);
            layerPanelOpen = !layerPanelOpen;
            if (layerPanelOpen) {
              panel.classList.add('layer-ctrl-panel-open');
            } else {
              panel.classList.remove('layer-ctrl-panel-open');
            }
          });

          return container;
        };

        layerPanelControl.addTo(map);
      }

      loadOsmWaterways();
      renderBoundary();
      renderFloodHazardLayer();
      renderBarangayBoundaries();
      setRainIntensityFromMmPerHour(0);
      refreshRainImpactData();
      setInterval(renderFloodHazardLayer, 30000);
      setInterval(refreshRainImpactData, 10000);
      setInterval(function() {
        if (Boolean(visibility.weatherOverlay) || Boolean(visibility.windOverlay)) {
          windLoadState = 'idle';
          loadWindFieldData();
        }
      }, 10 * 60 * 1000);
      renderIncidents();
      applyLayerVisibility();
      if (Boolean(visibility.weatherOverlay) || Boolean(visibility.windOverlay)) {
        loadWindFieldData();
      }
      renderLegendControl();
      renderLayerPanelControl();
      map.on('click', function(event) { identifyFloodAt(event.latlng); });
      map.on('resize', function() {
        refreshRainCanvasSize();
        refreshWindCanvasSize();
      });
      map.on('moveend', function() {
        refreshRainCanvasSize();
        refreshWindCanvasSize();
      });
      function syncWeatherCanvasLayout() {
        map.invalidateSize({ pan: false, animate: false });
        requestAnimationFrame(function() {
          refreshRainCanvasSize();
          refreshWindCanvasSize();
        });
      }
      window.addEventListener('resize', syncWeatherCanvasLayout);
      if (typeof ResizeObserver !== 'undefined') {
        var mapResizeObserver = new ResizeObserver(syncWeatherCanvasLayout);
        mapResizeObserver.observe(map.getContainer());
      }

      window.addEventListener('message', function(event) {
        var data = event && event.data ? event.data : null;
        if (!data || data.type !== 'dashboard-focus-barangay') {
          return;
        }

        var key = normalizeBarangayName(data.barangayKey);
        if (!key) {
          return;
        }

        focusedBarangayKey = key;
        selectedBarangayKey = key;
        focusedBarangayRiskLevel = normalizeRiskLevel(data.riskLevel);
        focusModeActive = true;
        pendingFocusFit = true;
        applyLayerVisibility();
      });

      if (fitBounds.isValid()) {
        map.fitBounds(fitBounds.pad(0.08), { maxZoom: 15 });
      } else {
        map.fitBounds(calambaBounds, { maxZoom: 12 });
      }
      if (Boolean(visibility.weatherOverlay) || Boolean(visibility.windOverlay)) {
        map.setView(calambaCenter, 12, { animate: false });
      }

    </script>
  </body>
</html>`;
}
