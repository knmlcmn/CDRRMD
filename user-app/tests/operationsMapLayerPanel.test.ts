import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function localPath(relativePath: string) {
  return decodeURIComponent(new URL(relativePath, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
}

const adminMapSource = readFileSync(localPath('../../admin-web/src/utils/calambaMapHtml.ts'), 'utf8');
const residentMapSource = readFileSync(localPath('../src/screens/RescueMapScreen.tsx'), 'utf8');
const rescuerMapSource = readFileSync(localPath('../src/utils/calambaMapHtml.ts'), 'utf8');
const barangayDashboardSource = readFileSync(localPath('../../admin-web/src/barangay/pages/DashboardPage.tsx'), 'utf8');
const barangayMonitoringSource = readFileSync(localPath('../../admin-web/src/barangay/pages/MonitoringPage.tsx'), 'utf8');
const populationRuntimeSource = readFileSync(localPath('../../admin-web/src/utils/populationDensityMapRuntime.ts'), 'utf8');

test('Admin and Barangay Operations Maps expose feature-gated Population Density in first position', () => {
  assert.doesNotMatch(adminMapSource, /key:\s*'boundary',\s*label:\s*'Calamba Boundary'/);
  assert.match(adminMapSource, /definitions\.unshift\(\{ key: 'populationDensity', label: 'Population Density'/);
  assert.match(adminMapSource, /populationDensityAvailable/);
  assert.match(adminMapSource, /buildPopulationDensityMapRuntimeScript\('payload\.barangayBoundaryGeoJsonUrl', 'mapBehavior\.jurisdictionBarangayName'\)/);
  for (const source of [barangayDashboardSource, barangayMonitoringSource]) {
    assert.match(source, /jurisdictionBarangayName:\s*barangayName/);
  }
  assert.doesNotMatch(populationRuntimeSource, /addPopulationControl|button\.textContent = 'Population Density'/);
});

test('Admin keeps six thematic layers single-select while operational layers stay independent', () => {
  assert.match(adminMapSource, /THEMATIC_LAYER_KEYS = \['populationDensity', 'floodHazard', 'weatherOverlay', 'temperatureOverlay', 'humidityOverlay', 'windOverlay'\]/);
  for (const operationalKey of ['evacuationAreas', 'incidentMarkers', 'responderRoute']) {
    assert.doesNotMatch(
      adminMapSource.match(/THEMATIC_LAYER_KEYS = \[[^\]]+\]/)?.[0] || '',
      new RegExp(operationalKey),
    );
  }
});

test('Resident and Rescuer maps contain no Population Density UI, fetch, overlay, legend, or popup runtime', () => {
  for (const source of [residentMapSource, rescuerMapSource]) {
    assert.doesNotMatch(source, /populationDensity|Population Density|population-density|cdrrmdPopulationDensityLayer/);
    assert.doesNotMatch(source, /buildPopulationDensityMapRuntimeScript/);
  }
  assert.match(residentMapSource, /if \(key === 'floodHazard'\)[\s\S]+visibility\.rainOverlay = false/);
  assert.match(residentMapSource, /key === 'rainOverlay' \|\| key === 'temperatureOverlay' \|\| key === 'humidityOverlay' \|\| key === 'windOverlay'/);
});

test('visible black city boundary overlay is removed but polygon overflow guards remain for every portal', () => {
  for (const source of [adminMapSource, residentMapSource, rescuerMapSource]) {
    assert.match(source, /setLayerVisible\(boundaryLayer, false\)/);
  }
  assert.doesNotMatch(adminMapSource, /legend-map-boundary[^\n]+Calamba Boundary/);
  assert.doesNotMatch(residentMapSource, /legend-map-boundary[^\n]+Calamba Boundary/);
  assert.match(adminMapSource, /function isWithinCalambaBoundary/);
  assert.match(residentMapSource, /function isWithinCalambaBoundary/);
});

test('fillable Population Density and Flood Hazard overlays reject segmented line geometry', () => {
  assert.match(populationRuntimeSource, /geometryType === 'Polygon' \|\| geometryType === 'MultiPolygon'/);
  assert.match(adminMapSource, /fill: polygonGeometry && !climateVisible/);
  assert.match(residentMapSource, /geometryType !== 'Polygon' && geometryType !== 'MultiPolygon'/);
  assert.match(rescuerMapSource, /if \(!polygonGeometry\)/);
});
