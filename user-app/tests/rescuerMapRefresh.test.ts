import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const userAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(userAppRoot, '..');

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Expected section ${start}`);
  return source.slice(startIndex, endIndex);
}

test('rescuer polling keeps one stable WebView source and posts incremental map updates', async () => {
  const [platformMap, assignments] = await Promise.all([
    readFile(resolve(userAppRoot, 'src/components/PlatformMap.tsx'), 'utf8'),
    readFile(resolve(userAppRoot, 'src/rescuer/screens/AssignmentsScreen.tsx'), 'utf8'),
  ]);

  assert.match(platformMap, /const initialHtmlRef = useRef\(html\)/);
  assert.match(platformMap, /const renderedHtml = preserveState \? initialHtmlRef\.current : html/);
  assert.match(platformMap, /webViewRef\.current\?\.postMessage\(message\)/);
  assert.match(assignments, /<PlatformMap[\s\S]*?preserveState[\s\S]*?updateMessage=\{mapUpdate\}/);
  assert.doesNotMatch(assignments, /<PlatformMap\s+key=\{(?:location|recenterRequestId|presenceRevision)/);
});

test('GPS, incidents, route, and flood layers update in place without clearing map state', async () => {
  const mapHtml = await readFile(resolve(repositoryRoot, 'admin-web/src/utils/calambaMapHtml.ts'), 'utf8');
  const incidents = section(mapHtml, 'function renderIncidents()', 'function setLayerVisible');
  const route = section(mapHtml, 'function renderResponderRoute(extendInitialBounds)', 'renderResponderFleet(true)');

  assert.match(incidents, /marker\.setLatLng\(\[lat, lon\]\)/);
  assert.match(incidents, /marker\.setPopupContent\(popupHtml\)/);
  assert.doesNotMatch(incidents, /incidentLayer\.clearLayers/);
  assert.match(route, /responderRouteMarker\.setLatLng/);
  assert.match(route, /responderRouteLine\.setLatLngs/);
  assert.doesNotMatch(route, /responderRouteLayer\.clearLayers/);
  assert.match(mapHtml, /canUpdateInPlace[\s\S]*?layer\.setStyle\(resolveBarangayBoundaryStyle\(feature\)\)/);
  assert.match(mapHtml, /layer\.setPopupContent\(popupHtml\)/);
});

test('safety polling intervals stay unchanged and requests remain single-flight', async () => {
  const [assignments, sensorMonitor, mapHtml] = await Promise.all([
    readFile(resolve(userAppRoot, 'src/rescuer/screens/AssignmentsScreen.tsx'), 'utf8'),
    readFile(resolve(userAppRoot, 'src/rescuer/services/waterSensorMonitor.ts'), 'utf8'),
    readFile(resolve(repositoryRoot, 'admin-web/src/utils/calambaMapHtml.ts'), 'utf8'),
  ]);

  assert.match(assignments, /setInterval\(\(\) => void refreshActive\(\), 5000\)/);
  assert.match(assignments, /if \(activeRequestRef\.current\)/);
  assert.match(sensorMonitor, /intervalMs: 3_000/);
  assert.match(mapHtml, /sensorRefreshIntervalMs\) \|\| 2000/);
  assert.match(mapHtml, /if \(hardwareFloodLoadState === 'loading'\) return/);
});

test('route requests ignore GPS jitter, do not overlap, and retain the last usable route', async () => {
  const assignments = await readFile(resolve(userAppRoot, 'src/rescuer/screens/AssignmentsScreen.tsx'), 'utf8');

  assert.match(assignments, /shouldRefreshRoute\(\{ previous, key: routeRefreshKey, location, now: refreshNow \}\)/);
  assert.match(assignments, /routeRequestRef\.current\?\.controller\.abort\(\)/);
  assert.match(assignments, /current\.routeCoordinates\.length > 1[\s\S]*?\? current/);
  assert.match(assignments, /alertRouteRequestRef\.current\?\.controller\.abort\(\)/);
});
