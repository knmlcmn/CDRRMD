import type { EvacuationAreaItem } from '../types';

export type Coordinate = { latitude: number; longitude: number };
export type MonitoringLayerVisibility = {
  boundary: boolean;
  floodHazard: boolean;
  evacuationAreas: boolean;
  incidentMarkers: boolean;
  responderRoute: boolean;
  weatherOverlay: boolean;
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
      .barangay-temp-label {
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(148, 163, 184, 0.6);
        border-radius: 999px;
        color: #ffffff;
        display: inline-block;
        font: 700 10px/1 Arial, sans-serif;
        padding: 3px 6px;
        white-space: nowrap;
      }
      .barangay-temp-wrap {
        cursor: pointer;
      }
      .map-rain-canvas {
        inset: 0;
        pointer-events: none;
        position: absolute;
        z-index: 430;
      }
      .weather-live-hud{backdrop-filter:blur(7px);background:rgba(15,23,42,.82);border:1px solid rgba(125,211,252,.45);border-radius:9px;color:#fff;display:none;font:700 10px/1.35 Arial,sans-serif;left:50%;padding:6px 9px;pointer-events:none;position:absolute;top:10px;transform:translateX(-50%);z-index:700;white-space:nowrap;box-shadow:0 4px 18px rgba(2,8,23,.3)}.weather-live-hud b{color:#7dd3fc}
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
        weatherOverlay: true
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

      var baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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

      // Iron tint overlay applied when Live Weather Overlay is on
      var ironOverlayLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '',
        opacity: 0,
        className: 'iron-overlay-tile',
      });

      function applyIronMapTint() {
        var weatherOn = Boolean(visibility.weatherOverlay);
        // Use CSS filter on the base tile layer pane to tint to #48494b iron tone
        var tilePane = map.getPanes().tilePane;
        if (tilePane) {
          tilePane.style.filter = weatherOn
            ? 'grayscale(1) brightness(0.62) sepia(0.18) hue-rotate(175deg) saturate(0.55)'
            : '';
        }
      }

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
      var weatherFillLayer = L.layerGroup();
      var barangayBoundaryLayer = L.layerGroup();
      var barangayTemperatureLayer = L.layerGroup();
      var barangayBoundaryGeoJsonData = null;
      var weatherFillGeoJsonData = null;
      var weatherImpactByBarangay = {};
      var cityRainIntensityMmPerHour = 0;
      var cityWindSpeedKph = 8, cityWindDirectionDegrees = 225, cityThunderstormProbabilityPct = 0;
      var rainCanvas = null;
      var rainCtx = null;
      var rainDrops = [];
      var rainAnimationFrame = null;
      var rainDropCount = 0;
      var windParticles = [], weatherFrameTick = 0, lightningFrames = 0, weatherHud = null;
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

        var pane = map.getPanes && map.getPanes().overlayPane;
        if (!pane) {
          return;
        }

        rainCanvas = document.createElement('canvas');
        rainCanvas.className = 'map-rain-canvas';
        pane.appendChild(rainCanvas);
        rainCtx = rainCanvas.getContext('2d');
        weatherHud=document.createElement('div');weatherHud.className='weather-live-hud';map.getContainer().appendChild(weatherHud);
        refreshRainCanvasSize();
      }

      function refreshRainCanvasSize() {
        if (!rainCanvas) {
          return;
        }

        var size = map.getSize();
        rainCanvas.width = Math.max(1, Number(size.x) || 1);
        rainCanvas.height = Math.max(1, Number(size.y) || 1);
      }

      function toRainDropCount(rainMmPerHour) {
        var mm = Number(rainMmPerHour);
        if (!Number.isFinite(mm) || mm < 0) {
          mm = 0;
        }
        // Keep a subtle drizzle cue visible when measured rain rounds to zero.
        if(mm<.1)return 0;return Math.round(45+Math.min(380,mm*38));
      }

      function seedWindParticles(){if(!rainCanvas)return;var count=Math.round(110+Math.min(230,Math.max(0,cityWindSpeedKph)*3));windParticles=[];for(var i=0;i<count;i+=1)windParticles.push({x:Math.random()*rainCanvas.width,y:Math.random()*rainCanvas.height,age:Math.random()*140,life:65+Math.random()*120,length:7+Math.random()*18,alpha:.16+Math.random()*.42,phase:Math.random()*Math.PI*2});}
      function updateWeatherHud(){if(!weatherHud)return;weatherHud.style.display=Boolean(visibility.weatherOverlay)?'block':'none';var condition=cityThunderstormProbabilityPct>=55?'THUNDERSTORM':cityRainIntensityMmPerHour>=7.5?'HEAVY RAIN':cityRainIntensityMmPerHour>=.1?'RAIN':'WIND';weatherHud.innerHTML='<b>LIVE '+condition+'</b> &nbsp; Rain '+cityRainIntensityMmPerHour.toFixed(1)+' mm/h &nbsp; Wind '+cityWindSpeedKph.toFixed(0)+' km/h &nbsp; Thunder '+cityThunderstormProbabilityPct.toFixed(0)+'%';}

      function seedRainDrops(count) {
        if (!rainCanvas) {
          return;
        }

        rainDrops = [];
        for (var i = 0; i < count; i += 1) {
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

        if (!map || !map._loaded) {
          rainAnimationFrame = requestAnimationFrame(animateRainCanvas);
          return;
        }

        rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
        weatherFrameTick+=1;

        var ring = payload.boundaryGeoJson && payload.boundaryGeoJson.features && payload.boundaryGeoJson.features[0]
          && payload.boundaryGeoJson.features[0].geometry && payload.boundaryGeoJson.features[0].geometry.coordinates
          ? payload.boundaryGeoJson.features[0].geometry.coordinates[0]
          : null;

        if (Array.isArray(ring) && ring.length >= 4) {
          rainCtx.save();
          rainCtx.beginPath();
          ring.forEach(function(coord, index) {
            var lng = Number(coord[0]);
            var lat = Number(coord[1]);
            var point = map.latLngToContainerPoint([lat, lng]);
            if (index === 0) {
              rainCtx.moveTo(point.x, point.y);
            } else {
              rainCtx.lineTo(point.x, point.y);
            }
          });
          rainCtx.closePath();
          rainCtx.clip();
        }
        if(cityRainIntensityMmPerHour>=.1){var strength=Math.min(1,cityRainIntensityMmPerHour/16);for(var band=0;band<3;band+=1){var bx=((weatherFrameTick*(.08+band*.025)+band*rainCanvas.width*.38)%(rainCanvas.width*1.5))-rainCanvas.width*.25;var by=rainCanvas.height*(.25+band*.24)+Math.sin(weatherFrameTick*.004+band)*35;var radius=Math.max(90,rainCanvas.width*(.18+strength*.08));var gradient=rainCtx.createRadialGradient(bx,by,0,bx,by,radius);var core=cityRainIntensityMmPerHour>=15?'220,38,38':cityRainIntensityMmPerHour>=7.5?'234,179,8':'34,197,94';gradient.addColorStop(0,'rgba('+core+','+(.10+strength*.12)+')');gradient.addColorStop(.48,'rgba(14,165,233,'+(.08+strength*.1)+')');gradient.addColorStop(1,'rgba(14,165,233,0)');rainCtx.fillStyle=gradient;rainCtx.fillRect(bx-radius,by-radius,radius*2,radius*2);}}
        var flowAngle=(cityWindDirectionDegrees+90)*Math.PI/180,flowSpeed=.65+Math.min(4.2,cityWindSpeedKph/18),vx=Math.cos(flowAngle)*flowSpeed,vy=Math.sin(flowAngle)*flowSpeed;for(var w=0;w<windParticles.length;w+=1){var particle=windParticles[w],curve=Math.sin(weatherFrameTick*.018+particle.phase+particle.y*.012)*.48,px=particle.x+Math.cos(flowAngle+Math.PI/2)*curve,py=particle.y+Math.sin(flowAngle+Math.PI/2)*curve;rainCtx.strokeStyle='rgba(238,248,255,'+particle.alpha+')';rainCtx.lineWidth=cityWindSpeedKph>=45?1.35:.9;rainCtx.beginPath();rainCtx.moveTo(px,py);rainCtx.quadraticCurveTo(px-vx*particle.length*.55+curve*3,py-vy*particle.length*.55,px-vx*particle.length,py-vy*particle.length);rainCtx.stroke();particle.x+=vx;particle.y+=vy;particle.age+=1;if(particle.age>particle.life||particle.x< -35||particle.x>rainCanvas.width+35||particle.y< -35||particle.y>rainCanvas.height+35){particle.x=Math.random()*rainCanvas.width;particle.y=Math.random()*rainCanvas.height;particle.age=0;}}

        for (var i = 0; i < rainDrops.length; i += 1) {
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

        if (Array.isArray(ring) && ring.length >= 4) {
          rainCtx.restore();
        }

        rainAnimationFrame = requestAnimationFrame(animateRainCanvas);
      }

      function updateRainEffectVisibility() {
        ensureRainCanvas();
        if (!rainCanvas) {
          return;
        }

        var enabled = Boolean(visibility.weatherOverlay);
        rainCanvas.style.display = enabled ? 'block' : 'none';
        updateWeatherHud();
        if (!enabled) {
          if (rainCtx) {
            rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
          }
          if (rainAnimationFrame) {
            cancelAnimationFrame(rainAnimationFrame);
            rainAnimationFrame = null;
          }
          return;
        }

        if (!rainAnimationFrame) {
          animateRainCanvas();
        }
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

        var nextCount = toRainDropCount(rainMmPerHour);
        if (nextCount !== rainDropCount || rainDrops.length === 0) {
          rainDropCount = nextCount;
          seedRainDrops(rainDropCount);
        }
        seedWindParticles();updateWeatherHud();
        updateRainEffectVisibility();
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
            '<div class="updated">Updated: ' + escapeHtml(updated) + '</div>' +
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
          return '#7f1d1d';
        }
        if (key === 'heavy') {
          return '#dc2626';
        }
        if (key === 'moderate') {
          return '#eab308';
        }
        return '#16a34a';
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

        var rainIntensity = Number(weatherImpact.rainIntensityMmPerHour || weatherImpact.averageRainfallMmPerHour || 0).toFixed(2);
        var temperature = Number(weatherImpact.temperatureCelsius || 0).toFixed(1);
        return '<div class="weather-popup">' +
          '<div class="head">WEATHER FORECAST OVERLAY</div>' +
          '<strong>' + name + '</strong>' +
          '<table>' +
            '<tr><td>Rain Level</td><td>' + String(weatherImpact.rainLevel || 'Light') + '</td></tr>' +
            '<tr><td>Rain Intensity</td><td>' + rainIntensity + ' mm/h</td></tr>' +
            '<tr><td>Temperature</td><td>' + temperature + ' C</td></tr>' +
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
          color: selected ? '#60a5fa' : resolveBarangayWeatherColor(props.flood_risk_level, weatherImpact),
          weight: selected ? 4.2 : (floodHazardVisible ? 3 : 2.3),
          opacity: 1,
          fill: selected,
          fillColor: selected ? '#60a5fa' : '#000000',
          fillOpacity: selected ? 0.2 : 0,
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
        renderBarangayTemperatureLayer();

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
            var risk = weatherImpact
              ? String(weatherImpact.rainLevel || 'Light').toUpperCase()
              : String(props.flood_risk_level || 'LOW').toUpperCase();
            var temperatureText = weatherImpact && Number.isFinite(Number(weatherImpact.temperatureCelsius))
              ? Number(weatherImpact.temperatureCelsius).toFixed(1) + ' C'
              : 'N/A';
            layer.bindTooltip(name + ' (' + risk + ' | ' + temperatureText + ')', { sticky: true });
            layer.bindPopup(buildBoundaryPopupHtml(props, weatherImpact));
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

      function renderBarangayTemperatureLayer() {
        barangayTemperatureLayer.clearLayers();
        var source = latestBarangayGeoJsonData || barangayBoundaryGeoJsonData;
        if (!source || !Boolean(visibility.weatherOverlay) || focusModeActive) {
          return;
        }

        var features = Array.isArray(source.features)
          ? source.features
          : [];

        features.forEach(function(feature) {
          var props = feature && feature.properties ? feature.properties : {};
          var key = normalizeBarangayName(props.barangay_name);
          var weatherImpact = weatherImpactByBarangay[key] || null;
          var temperature = weatherImpact && Number.isFinite(Number(weatherImpact.temperatureCelsius))
            ? Number(weatherImpact.temperatureCelsius).toFixed(1) + ' C'
            : null;
          if (!temperature) {
            return;
          }

          var featureLayer = L.geoJSON(feature);
          var bounds = featureLayer.getBounds && featureLayer.getBounds();
          if (!bounds || !bounds.isValid()) {
            return;
          }

          var center = bounds.getCenter();
          if (!Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) {
            return;
          }

          L.marker([center.lat, center.lng], {
            interactive: true,
            icon: L.divIcon({
              className: 'barangay-temp-wrap',
              html: '<span class="barangay-temp-label">' + temperature + '</span>',
            }),
          })
            .addTo(barangayTemperatureLayer)
            .on('click', function() {
              selectBarangayByKey(key, true);
            });
        });
      }

      function renderWeatherFillLayer() {
        weatherFillLayer.clearLayers();
        if (!weatherFillGeoJsonData || !Boolean(visibility.weatherOverlay) || focusModeActive) {
          return;
        }

        L.geoJSON(weatherFillGeoJsonData, {
          style: function(feature) {
            var props = feature && feature.properties ? feature.properties : {};
            return {
              color: '#0f172a',
              weight: 0.8,
              opacity: 0.45,
              fillColor: resolveRainFillColor(props.rain_level),
              fillOpacity: 0.36,
            };
          },
          interactive: false,
        }).addTo(weatherFillLayer);
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
          renderBarangayTemperatureLayer();
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
            renderBarangayTemperatureLayer();
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

      function renderCityAlert(text) {
        clearCityAlert();
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
            var cityWeather=data&&data.cityWeather?data.cityWeather:{};cityWindSpeedKph=Number(cityWeather.windSpeedKph);if(!Number.isFinite(cityWindSpeedKph))cityWindSpeedKph=8;cityWindDirectionDegrees=Number(cityWeather.windDirectionDegrees);if(!Number.isFinite(cityWindDirectionDegrees))cityWindDirectionDegrees=225;cityThunderstormProbabilityPct=Number(cityWeather.thunderstormProbabilityPct);if(!Number.isFinite(cityThunderstormProbabilityPct))cityThunderstormProbabilityPct=0;
            setRainIntensityFromMmPerHour(cityRainIntensityMmPerHour);
            renderBarangayBoundaryLayer();
            renderWeatherFillLayer();
            renderBarangayTemperatureLayer();

            cityWeather = data && data.cityWeather ? data.cityWeather : null;
            var cityAlert = cityWeather && cityWeather.cityWideTyphoonAlert ? cityWeather.cityWideTyphoonAlert : null;
            if (cityAlert && cityAlert.active && hasActiveRain) {
              renderCityAlert('CITY-WIDE TYPHOON ALERT: ' + String(cityAlert.message || 'Potential full-city typhoon path impact detected.'));
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
        var showBoundary = focusModeActive ? false : Boolean(visibility.boundary);
        var showFloodHazard = focusModeActive ? false : Boolean(visibility.floodHazard);
        var showWeather = focusModeActive ? false : Boolean(visibility.weatherOverlay);
        var showBarangayBoundary = focusModeActive ? true : Boolean(visibility.boundary);
        var showTemperature = focusModeActive ? false : Boolean(visibility.weatherOverlay);
        var showAreas = focusModeActive ? false : Boolean(visibility.evacuationAreas);
        var showIncidents = focusModeActive ? false : Boolean(visibility.incidentMarkers);
        var showResponderRoute = focusModeActive ? false : Boolean(visibility.responderRoute);

        setLayerVisible(boundaryLayer, showBoundary);
        setLayerVisible(floodHazardLayer, showFloodHazard);
        setLayerVisible(weatherFillLayer, showWeather);
        setLayerVisible(barangayBoundaryLayer, showBarangayBoundary);
        setLayerVisible(barangayTemperatureLayer, showTemperature);
        renderBarangayBoundaryLayer();
        renderWeatherFillLayer();
        renderBarangayTemperatureLayer();
        setLayerVisible(areaLayer, showAreas);
        setLayerVisible(incidentLayer, showIncidents);
        setLayerVisible(responderRouteLayer, showResponderRoute);

        if (focusModeActive) {
          if (rainCanvas) {
            rainCanvas.style.display = 'none';
          }
          if (rainCtx && rainCanvas) {
            rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
          }
          if (rainAnimationFrame) {
            cancelAnimationFrame(rainAnimationFrame);
            rainAnimationFrame = null;
          }
        } else {
          updateRainEffectVisibility();
        }

        applyIronMapTint();
        renderLegendControl();
      }

      var areaPinIcon = L.divIcon({
        className: 'evac-pin',
        html: '<div style="align-items:center;background:#e11d48;border:3px solid #fff;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;height:16px;justify-content:center;width:16px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-ambulance.svg" style="filter:brightness(0) invert(1);height:12px;width:12px" /></div>',
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

      loadOsmWaterways();
      renderBoundary();
      renderFloodHazardLayer();
      renderBarangayBoundaries();
      setRainIntensityFromMmPerHour(0);
      refreshRainImpactData();
      setInterval(renderFloodHazardLayer, 30000);
      setInterval(refreshRainImpactData, 10000);
      renderIncidents();
      applyLayerVisibility();
      renderLegendControl();
      map.on('click', function(event) { identifyFloodAt(event.latlng); });
      map.on('resize', refreshRainCanvasSize);
      map.on('moveend', refreshRainCanvasSize);

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

    </script>
  </body>
</html>`;
}
