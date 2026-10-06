export const MODERATE_WATER_LEVEL_THRESHOLD = 40;
export const HIGH_WATER_LEVEL_THRESHOLD = 61;

const HARDWARE_FLOOD_COLORS = {
  LOW: '#0284c7',
  MODERATE: '#d97706',
  HIGH: '#b91c1c',
  UNAVAILABLE: '#64748b',
} as const;

const WATER_LEVEL_SENSOR_ASSIGNMENTS = [
  { id: 'waterSensor1', barangayName: 'Palingon' },
  { id: 'waterSensor2', barangayName: 'Sampiruhan' },
  { id: 'waterSensor3', barangayName: 'Lingga' },
  { id: 'waterSensor4', barangayName: 'Parian' },
  { id: 'waterSensor5', barangayName: 'Looc' },
  { id: 'waterSensor6', barangayName: 'Uwisan' },
] as const;

const WATER_LEVEL_DATABASE_URL = 'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app';

export function buildHardwareFloodRuntimeScript() {
  return `
      var HARDWARE_FLOOD_MODERATE_MIN = ${MODERATE_WATER_LEVEL_THRESHOLD};
      var HARDWARE_FLOOD_HIGH_MIN = ${HIGH_WATER_LEVEL_THRESHOLD};
      var HARDWARE_FLOOD_COLORS = ${JSON.stringify(HARDWARE_FLOOD_COLORS)};
      var WATER_LEVEL_SENSOR_ASSIGNMENTS = ${JSON.stringify(WATER_LEVEL_SENSOR_ASSIGNMENTS)};
      var WATER_LEVEL_DATABASE_URL = ${JSON.stringify(WATER_LEVEL_DATABASE_URL)};
      var hardwareFloodByBarangay = {};
      var hardwareFloodUpdatedAt = null;
      var hardwareFloodLoadState = 'idle';

      function normalizeHardwareBarangayName(value) {
        return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, ' ').replace(/^(barangay|brgy)\\s+/, '').trim();
      }

      function readHardwareNumber(payload, keys) {
        if (!payload || typeof payload !== 'object') return null;
        for (var index = 0; index < keys.length; index += 1) {
          var raw = payload[keys[index]];
          var value = Number(raw);
          if (raw !== '' && raw !== null && raw !== undefined && Number.isFinite(value)) return value;
        }
        return null;
      }

      function normalizeHardwareReading(payload) {
        var source = payload && typeof payload === 'object' ? payload : null;
        var nestedDistance = source && source.distance && typeof source.distance === 'object' ? source.distance : null;
        var directDistance = source && typeof source.distance === 'number' ? Number(source.distance) : null;
        var distanceCm = Number.isFinite(directDistance) ? directDistance
          : readHardwareNumber(nestedDistance, ['distanceCm', 'distance_cm', 'distance'])
            ?? readHardwareNumber(source, ['distanceCm', 'distance_cm']);
        var reportedPercentage = readHardwareNumber(source, ['fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level'])
          ?? readHardwareNumber(nestedDistance, ['fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level']);
        var percentage = reportedPercentage;
        if (percentage === null && Number.isFinite(distanceCm)) {
          percentage = distanceCm <= 20 ? 100 : distanceCm >= 200 ? 0 : ((200 - distanceCm) / 180) * 100;
        }
        return {
          hasReading: percentage !== null,
          waterLevelPercentage: percentage === null ? null : Math.max(0, Math.min(100, percentage)),
        };
      }

      function classifyHardwareFloodLevel(percentage) {
        if (!Number.isFinite(percentage)) return 'UNAVAILABLE';
        if (percentage >= HARDWARE_FLOOD_HIGH_MIN) return 'HIGH';
        if (percentage >= HARDWARE_FLOOD_MODERATE_MIN) return 'MODERATE';
        return 'LOW';
      }

      function hardwareFloodState(barangayName) {
        return hardwareFloodByBarangay[normalizeHardwareBarangayName(barangayName)] || {
          level: 'UNAVAILABLE', color: HARDWARE_FLOOD_COLORS.UNAVAILABLE,
          waterLevelPercentage: null, hasReading: false, status: 'Unavailable',
        };
      }

      function hardwareFloodBoundaryStyle(barangayName, selected) {
        var state = hardwareFloodState(barangayName);
        return {
          color: state.color,
          weight: selected ? 5 : 3,
          opacity: 1,
          fill: true,
          fillColor: state.color,
          fillOpacity: state.level === 'UNAVAILABLE' ? 0.16 : 0.32,
        };
      }

      function hardwareFloodPopupHtml(barangayName) {
        var state = hardwareFloodState(barangayName);
        var percentage = state.hasReading ? Number(state.waterLevelPercentage).toFixed(0) + '%' : 'No reading';
        return '<div class="flood-info"><div class="head">HARDWARE FLOOD HAZARD</div><table>' +
          '<tr><td>Barangay</td><td>' + escapeHtml(barangayName) + '</td></tr>' +
          '<tr><td>Hardware</td><td>' + escapeHtml(state.sensorId || 'Not assigned') + '</td></tr>' +
          '<tr><td>Water Level</td><td>' + percentage + '</td></tr>' +
          '<tr><td>Hazard Level</td><td>' + state.level + '</td></tr>' +
          '</table></div>';
      }

      function hardwareFloodLegendHtml() {
        return '<div class="legend-section-label"><span class="legend-section-dot" style="background:#2563eb;"></span>Hardware Water Level</div>' +
          '<div class="row"><span class="swatch" style="background:#b91c1c;"></span>High (61-100%)</div>' +
          '<div class="row"><span class="swatch" style="background:#d97706;"></span>Moderate (40-60%)</div>' +
          '<div class="row"><span class="swatch" style="background:#0284c7;"></span>Low (0-39%)</div>' +
          '<div class="row"><span class="swatch" style="background:#64748b;"></span>No hardware reading</div>';
      }

      function refreshHardwareFloodLevels() {
        if (hardwareFloodLoadState === 'loading') return;
        hardwareFloodLoadState = 'loading';
        var statusUrl = WATER_LEVEL_DATABASE_URL + '/' + encodeURIComponent('Sensor Status Settings') + '.json';
        Promise.all([
          fetch(statusUrl).then(function(response) { return response.ok ? response.json() : {}; }).catch(function() { return {}; }),
          Promise.all(WATER_LEVEL_SENSOR_ASSIGNMENTS.map(function(assignment) {
            return fetch(WATER_LEVEL_DATABASE_URL + '/' + assignment.id + '.json')
              .then(function(response) { return response.ok ? response.json() : null; }).catch(function() { return null; })
              .then(function(reading) { return { assignment: assignment, reading: reading }; });
          })),
        ]).then(function(results) {
          var statuses = results[0] && typeof results[0] === 'object' ? results[0] : {};
          var nextLookup = {};
          results[1].forEach(function(item) {
            var storedStatus = statuses[item.assignment.id];
            var statusText = storedStatus && typeof storedStatus === 'object' ? String(storedStatus.status || '') : String(storedStatus || '');
            var status = statusText === 'Unavailable' ? 'Unavailable' : 'Active';
            var reading = normalizeHardwareReading(item.reading);
            var hasReading = status === 'Active' && reading.hasReading;
            var percentage = hasReading ? reading.waterLevelPercentage : null;
            var level = classifyHardwareFloodLevel(percentage);
            nextLookup[normalizeHardwareBarangayName(item.assignment.barangayName)] = {
              sensorId: item.assignment.id, status: status, hasReading: hasReading,
              waterLevelPercentage: percentage, level: level, color: HARDWARE_FLOOD_COLORS[level],
            };
          });
          hardwareFloodByBarangay = nextLookup;
          hardwareFloodUpdatedAt = new Date();
          hardwareFloodLoadState = 'ready';
          if (typeof onHardwareFloodLevelsUpdated === 'function') onHardwareFloodLevelsUpdated();
        }).catch(function() { hardwareFloodLoadState = 'idle'; });
      }
  `;
}
