import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const screenPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/screens/RescueMapScreen.tsx',
);

test('Request Rescue renders its native shell before location and map readiness', async () => {
  const screen = await readFile(screenPath, 'utf8');
  assert.doesNotMatch(screen, /if \(loading \|\| !userLocation \|\| !mapHtml\)/);
  assert.match(screen, /Preparing rescue map/);
  assert.match(screen, /disabled=\{!locationVerified \|\| routingRecommendation\}/);
  assert.match(screen, /setUserLocation\(null\)/);
  assert.doesNotMatch(screen, /setUserLocation\(\{ latitude: 14\.2128, longitude: 121\.1671 \}\)/);
});

test('map construction and noncritical history wait until navigation interactions settle', async () => {
  const screen = await readFile(screenPath, 'utf8');
  assert.match(screen, /InteractionManager\.runAfterInteractions\(\(\) => \{[\s\S]*?setMapVisualReady\(true\)/);
  assert.match(screen, /if \(userLocation && mapVisualReady && !initialMapHtmlRef\.current\)/);
  assert.match(screen, /InteractionManager\.runAfterInteractions\(\(\) => \{[\s\S]*?loadRecentRescueRecords/);
  assert.match(screen, /historyTask\.cancel\(\)/);
});

test('map updates do not replace the WebView HTML source', async () => {
  const screen = await readFile(screenPath, 'utf8');
  assert.match(screen, /initialMapHtmlRef/);
  assert.match(screen, /type: 'rescue-map-update'/);
  assert.match(screen, /preserveState updateMessage=\{mapUpdateMessage\}/);
  assert.match(screen, /requestStarted \? 4_000 : 30_000/);
});

test('new rescue actions require a fresh evacuation snapshot', async () => {
  const screen = await readFile(screenPath, 'utf8');
  assert.match(screen, /const areasRequest = loadEvacuationAreas\(true, false, lifecycle\.signal, isCurrent\)/);
  assert.match(screen, /'Cache-Control': 'no-cache'/);
  assert.match(screen, /if \(authoritative\) throw caught/);
  assert.match(screen, /signal,\s*\}\)\.then/);
  assert.match(screen, /if \(signal\?\.aborted\) throw new Error\('EVACUATION_REQUEST_ABORTED'\)/);
  assert.doesNotMatch(screen, /evacuationAreas\.length > 0[\s\S]*?Promise\.resolve\(evacuationAreas\)/);
});

test('cancel and screen blur abort the owned route lifecycle and suppress stale state', async () => {
  const screen = await readFile(screenPath, 'utf8');
  assert.match(screen, /recommendationLifecycle\.begin\(RESCUE_PIPELINE_TIMEOUT_MS\)/);
  assert.match(screen, /recommendationLifecycle\.cancel\(\);[\s\S]*?setRoutingRecommendation\(false\)/);
  assert.match(screen, /const isCurrent = lifecycle\.isCurrent/);
  assert.match(screen, /loadEvacuationAreas\(true, false, lifecycle\.signal, isCurrent\)/);
  assert.match(screen, /resolveBestRoadPlan\([\s\S]*?lifecycle\.signal\)/);
  assert.match(screen, /outcome: 'cancelled'/);
});

test('the rescue pipeline has one end-to-end deadline and keeps its WebView mounted across tab blur', async () => {
  const screen = await readFile(screenPath, 'utf8');
  assert.match(screen, /const RESCUE_PIPELINE_TIMEOUT_MS = 18_000/);
  assert.doesNotMatch(screen, /if \(!isScreenFocused\) \{[\s\S]*?setMapVisualReady\(false\)/);
  assert.match(screen, /\{!isMapFullscreen && mapVisualReady && mapHtml/);
});

test('submission fails closed when authoritative capacity is unavailable or omits the selected center', async () => {
  const screen = await readFile(screenPath, 'utf8');
  const submit = screen.slice(screen.indexOf('async function handleSubmitRescue'), screen.indexOf('function statusLabel'));
  assert.ok(submit.indexOf('setSubmitting(true)') < submit.indexOf('loadEvacuationAreas(true, false)'));
  assert.match(submit, /const refreshedSelected = latestAreas\.find/);
  assert.doesNotMatch(submit, /latestAreas\.find\([\s\S]*?\) \|\| selectedArea/);
  assert.match(submit, /current evacuation capacity could not be verified/);
  assert.match(submit, /selected evacuation center is no longer in the live capacity list/);
});

test('HTTP 400 barangay rejection remains authoritative and does not start OSRM routing', async () => {
  const screen = await readFile(screenPath, 'utf8');
  const selection = screen.slice(screen.indexOf('const beginRescueRequest'), screen.indexOf('useEffect(() => () =>'));
  assert.match(selection, /barangayValidationStatus = Number\(error\?\.response\?\.status \|\| 0\)/);
  assert.match(selection, /barangayValidationStatus === 400/);
  assert.match(selection, /could not match your current GPS location to an authorized Calamba barangay/);
  assert.doesNotMatch(selection, /session\?\.user\?\.barangayName/);
  assert.ok(selection.indexOf('if (!reportBarangay)') < selection.indexOf("beginPerformanceStage('evacuation-road-routing')"));
});

test('rescue submission cannot request a test-mode service-area bypass', async () => {
  const screen = await readFile(screenPath, 'utf8');
  const submit = screen.slice(screen.indexOf('async function handleSubmitRescue'), screen.indexOf('function statusLabel'));
  assert.doesNotMatch(submit, /testModeBypassServiceArea/);
});
