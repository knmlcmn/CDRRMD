import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function localPath(relativePath: string) {
  return decodeURIComponent(new URL(relativePath, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
}

const adminMapSource = readFileSync(localPath('../../admin-web/src/utils/calambaMapHtml.ts'), 'utf8');
const residentMapSource = readFileSync(localPath('../src/screens/RescueMapScreen.tsx'), 'utf8');
const sharedResidentMapSource = readFileSync(localPath('../src/utils/calambaMapHtml.ts'), 'utf8');
const populationRuntimeSource = readFileSync(localPath('../../admin-web/src/utils/populationDensityMapRuntime.ts'), 'utf8');
const adminPortalSource = readFileSync(localPath('../../admin-web/src/pages/DashboardPage.tsx'), 'utf8');
const barangayPortalSource = readFileSync(localPath('../../admin-web/src/barangay/pages/DashboardPage.tsx'), 'utf8');
const residentPortalSource = readFileSync(localPath('../src/screens/RescueMapScreen.tsx'), 'utf8');
const rescuerPortalSource = readFileSync(localPath('../src/rescuer/screens/AssignmentsScreen.tsx'), 'utf8');
const mobileRuntimeSource = readFileSync(localPath('../src/utils/populationDensityMapRuntime.ts'), 'utf8');

test('Operations Map replaces the boundary tile with feature-gated Population Density in first position', () => {
  for (const source of [adminMapSource, residentMapSource]) {
    assert.doesNotMatch(source, /key:\s*'boundary',\s*label:\s*'Calamba Boundary'/);
    assert.match(source, /definitions\.unshift\(\{ key: 'populationDensity', label: 'Population Density'/);
    assert.match(source, /populationDensityAvailable/);
  }
  assert.doesNotMatch(populationRuntimeSource, /addPopulationControl|button\.textContent = 'Population Density'/);
});

test('the six thematic layers are single-select while operational layers stay outside that set', () => {
  assert.match(adminMapSource, /THEMATIC_LAYER_KEYS = \['populationDensity', 'floodHazard', 'weatherOverlay', 'temperatureOverlay', 'humidityOverlay', 'windOverlay'\]/);
  assert.match(residentMapSource, /thematicLayerKeys = \['populationDensity', 'floodHazard', 'rainOverlay', 'temperatureOverlay', 'humidityOverlay', 'windOverlay'\]/);
  for (const operationalKey of ['evacuationAreas', 'incidentMarkers', 'responderRoute']) {
    assert.doesNotMatch(
      adminMapSource.match(/THEMATIC_LAYER_KEYS = \[[^\]]+\]/)?.[0] || '',
      new RegExp(operationalKey),
    );
  }
});

test('visible black city boundary overlay and legend entry are removed but geometry validation remains', () => {
  for (const source of [adminMapSource, residentMapSource, sharedResidentMapSource]) {
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
});

test('existing Map Legend panels own density categories in highest-to-lowest order', () => {
  for (const source of [adminMapSource, residentMapSource, sharedResidentMapSource]) {
    assert.match(source, /Derived Population Density/);
    assert.match(source, /30,000\+ people\/km&sup2;[\s\S]+20,000&ndash;29,999[\s\S]+15,000&ndash;19,999[\s\S]+10,000&ndash;14,999[\s\S]+Below 10,000/);
    assert.match(source, /visibility\.populationDensity/);
  }
  assert.doesNotMatch(populationRuntimeSource, /populationLegend|showPopulationLegend|removePopulationLegend/);
});

test('Admin, Barangay, Resident, and Rescuer maps all use the shared database-backed population runtime', () => {
  assert.match(adminPortalSource, /buildCalambaMapHtml/);
  assert.match(barangayPortalSource, /buildCalambaMapHtml/);
  assert.match(residentPortalSource, /buildPopulationDensityMapRuntimeScript/);
  assert.match(rescuerPortalSource, /buildCalambaMapHtml/);
  assert.match(mobileRuntimeSource, /admin-web\/src\/utils\/populationDensityMapRuntime/);
  assert.match(populationRuntimeSource, /\/gis\/population-density/);
  assert.doesNotMatch(populationRuntimeSource, /33300|7690|6518|3689|11754|31735/);
});
