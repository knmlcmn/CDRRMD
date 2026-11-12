import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const devtoolsPort = Number(process.env.CHROME_DEVTOOLS_PORT || 9222);
const appUrl = process.env.VISUAL_APP_URL || 'http://127.0.0.1:5173/';
const mockApiOrigin = 'http://127.0.0.1:4400';
const outputDirectory = path.resolve('artifacts/rescuer-presence-visual');
const adminToken = 'e30.eyJyb2xlIjoiYWRtaW4ifQ.x';
const barangayToken = `e30.${Buffer.from(JSON.stringify({ role: 'barangay', barangayName: 'Looc' })).toString('base64url')}.x`;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(200);
  }
  throw new Error(message);
}

const targets = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`).then((response) => response.json());
const pageTarget = targets.find((target) => target.type === 'page');
assert.ok(pageTarget?.webSocketDebuggerUrl, 'No Chrome page target is available');

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const networkRequests = [];
const interceptedExternalDataUrls = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.method === 'Network.requestWillBeSent') networkRequests.push({ url: message.params.request.url, type: message.params.type });
  if (message.method === 'Fetch.requestPaused') {
    const url = message.params.request.url;
    interceptedExternalDataUrls.push(url);
    if (url.includes('cdrrmd-backend.vercel.app')) {
      void command('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' });
    } else {
      const body = url.includes('/route/v1/') ? { routes: [] } : url.includes('/api/interpreter') ? { elements: [] } : {};
      void command('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Content-Type', value: 'application/json' },
        ],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
    }
  }
  if (!message.id) return;
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result.value;
}

async function waitForText(text) {
  return waitFor(
    () => evaluate(`document.body && document.body.innerText.includes(${JSON.stringify(text)})`),
    `Timed out waiting for ${text}`,
  );
}

async function setMockMode(mode) {
  const result = await evaluate(`fetch(${JSON.stringify(`${mockApiOrigin}/api/__mock/state?value=${mode}`)}, { cache: 'no-store' }).then((response) => response.json())`);
  assert.equal(result.mode, mode);
}

async function refreshVisiblePage() {
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
}

async function mapState() {
  return evaluate(`(() => {
    const frame = document.querySelector('iframe[title*="map" i]');
    const mapWindow = frame && frame.contentWindow;
    const markerPopups = [];
    if (mapWindow && mapWindow.map && typeof mapWindow.map.eachLayer === 'function') {
      mapWindow.map.eachLayer((layer) => {
        if (typeof layer.getLatLng !== 'function') return;
        const popup = typeof layer.getPopup === 'function' ? layer.getPopup() : null;
        markerPopups.push(popup ? String(popup.getContent()) : '(no popup)');
      });
    }
    return {
      frameTitle: frame && frame.title,
      fleetMarkers: mapWindow && mapWindow.responderFleetLayer ? mapWindow.responderFleetLayer.getLayers().length : -1,
      routeMarkers: mapWindow && mapWindow.responderRouteLayer ? mapWindow.responderRouteLayer.getLayers().length : -1,
      markerPopups,
    };
  })()`);
}

async function waitForFleet(predicate, label, timeoutMs = 20_000) {
  return waitFor(async () => {
    const state = await mapState();
    return predicate(state.fleetMarkers) ? state : null;
  }, `${label}: responder fleet did not reach the expected state`, timeoutMs);
}

function assertNoResponderPopups(state, label) {
  assert.equal(state.markerPopups.some((popup) => /rescuer|active cdrrmd|active barangay/i.test(popup)), false, `${label}: responder popup remained outside dynamic layers`);
}

function assertAvailableAndBusy(state, label) {
  assert.ok(state.markerPopups.some((popup) => popup.includes('Available')), `${label}: no Available responder popup`);
  assert.ok(state.markerPopups.some((popup) => popup.includes('Assigned to an active incident')), `${label}: no Busy responder popup`);
  assert.ok(state.markerPopups.some((popup) => popup.includes('Active CDRRMD')), `${label}: no active CDRRMD responder popup`);
  assert.ok(state.markerPopups.some((popup) => popup.includes('Active Barangay')), `${label}: no active Barangay responder popup`);
}

async function screenshot(name) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const target = path.join(outputDirectory, name);
  fs.writeFileSync(target, Buffer.from(result.data, 'base64'));
  return target;
}

async function verifyLifecycle(label, minimumLiveMarkers, screenshotPrefix) {
  await setMockMode('hidden');
  await refreshVisiblePage();
  const hidden = await waitForFleet((count) => count === 0, label);
  assert.equal(hidden.routeMarkers, 0, `${label}: offline/stale route marker remained`);
  assertNoResponderPopups(hidden, label);

  await setMockMode('live');
  await refreshVisiblePage();
  const live = await waitForFleet((count) => count >= minimumLiveMarkers, label);
  assertAvailableAndBusy(live, label);
  const liveScreenshot = await screenshot(`${screenshotPrefix}-live.png`);

  await setMockMode('logout');
  await refreshVisiblePage();
  const loggedOut = await waitForFleet((count) => count === 0, label);
  assertNoResponderPopups(loggedOut, label);

  await setMockMode('live');
  await refreshVisiblePage();
  await waitForFleet((count) => count >= minimumLiveMarkers, label);
  await setMockMode('failure');
  await refreshVisiblePage();
  const failed = await waitForFleet((count) => count === 0, label);
  assertNoResponderPopups(failed, label);

  await setMockMode('expiring');
  await refreshVisiblePage();
  await waitForFleet((count) => count >= minimumLiveMarkers, label);
  const expired = await waitForFleet((count) => count === 0, label, 12_000);
  assertNoResponderPopups(expired, label);
  const expiredScreenshot = await screenshot(`${screenshotPrefix}-expired.png`);

  return { hidden, live, loggedOut, failed, expired, liveScreenshot, expiredScreenshot };
}

await command('Page.enable');
await command('Runtime.enable');
await command('Network.enable');
await command('Fetch.enable', { patterns: [
  { urlPattern: 'https://cdrrmd-backend.vercel.app/*', requestStage: 'Request' },
  { urlPattern: 'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app/*', requestStage: 'Request' },
  { urlPattern: 'https://overpass-api.de/*', requestStage: 'Request' },
  { urlPattern: 'https://overpass.kumi.systems/*', requestStage: 'Request' },
  { urlPattern: 'https://overpass.openstreetmap.fr/*', requestStage: 'Request' },
  { urlPattern: 'https://router.project-osrm.org/*', requestStage: 'Request' },
] });
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url: appUrl });
await waitFor(() => evaluate(`location.origin === 'http://127.0.0.1:5173' && Boolean(document.body)`), 'App origin did not load');

await setMockMode('hidden');
await evaluate(`localStorage.setItem('admin_token', ${JSON.stringify(adminToken)}); location.reload()`);
await waitForText('Operations Map');
await waitFor(() => mapState().then((state) => state.frameTitle === 'Operations map'), 'Dashboard map did not load');
const dashboard = await verifyLifecycle('Admin Dashboard', 2, 'admin-dashboard');

await setMockMode('hidden');
await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Open Monitoring'))?.click()`);
await waitFor(() => mapState().then((state) => state.frameTitle === 'Monitoring map'), 'Incident Monitoring map did not load');
const incidentMonitoring = await verifyLifecycle('Incident Monitoring', 2, 'admin-incident-monitoring');

await setMockMode('hidden');
await evaluate(`localStorage.setItem('admin_token', ${JSON.stringify(barangayToken)}); location.reload()`);
await waitForText('Barangay Dashboard');
await evaluate(`document.querySelector('button[title="Incident Monitoring"]')?.click()`);
await waitFor(() => mapState().then((state) => state.frameTitle === 'Barangay monitoring map'), 'Barangay Monitoring map did not load');
const barangayMonitoring = await verifyLifecycle('Barangay Monitoring', 2, 'barangay-incident-monitoring');

await setMockMode('live');
await refreshVisiblePage();
await waitForFleet((count) => count >= 2, 'Barangay logout setup');
await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Logout')?.click()`);
await waitForText('Account ID');
assert.equal(await evaluate(`document.querySelector('iframe[title*="map" i]') === null`), true, 'Logout left a map iframe mounted');

const mockApiRequests = networkRequests.filter((request) => request.url.startsWith(`${mockApiOrigin}/api/`));
assert.ok(mockApiRequests.length > 0, 'No mock API traffic was captured');
assert.equal(networkRequests.some((request) => request.url.includes('cdrrmd-backend.vercel.app')), false, 'Production backend was contacted');
assert.equal(interceptedExternalDataUrls.some((url) => url.includes('cdrrmd-backend.vercel.app')), false, 'Production backend request was attempted');
assert.ok(interceptedExternalDataUrls.some((url) => url.includes('firebasedatabase.app')), 'Firebase fixture interception was not exercised');
assert.ok(interceptedExternalDataUrls.some((url) => url.includes('overpass')), 'Overpass fixture interception was not exercised');

process.stdout.write(`${JSON.stringify({
  dashboard,
  incidentMonitoring,
  barangayMonitoring,
  capturedMockApiRequests: mockApiRequests.length,
  apiOrigins: [...new Set(mockApiRequests.map((request) => new URL(request.url).origin))],
  interceptedExternalDataRequests: interceptedExternalDataUrls.length,
  interceptedExternalDataOrigins: [...new Set(interceptedExternalDataUrls.map((url) => new URL(url).origin))],
  productionBackendContacted: false,
}, null, 2)}\n`);
socket.close();
