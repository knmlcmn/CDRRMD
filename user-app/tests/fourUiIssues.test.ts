import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function localPath(relativePath: string) {
  return decodeURIComponent(new URL(relativePath, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
}

const adminModalCss = readFileSync(localPath('../../admin-web/src/components/BackupNotifications.css'), 'utf8');
const routeMapSource = readFileSync(localPath('../../admin-web/src/barangay/components/RescueRequestRouteMap.tsx'), 'utf8');
const rescueSource = readFileSync(localPath('../src/screens/RescueMapScreen.tsx'), 'utf8');
const familySource = readFileSync(localPath('../src/screens/FamilyScreen.tsx'), 'utf8');
const weatherSource = readFileSync(localPath('../src/screens/WeatherScreen.tsx'), 'utf8');
const reportControllerSource = readFileSync(localPath('../../backend/src/controllers/reportController.js'), 'utf8');

test('Admin backup modal owns a responsive vertical-scroll layout and resizes its map', () => {
  assert.match(adminModalCss, /overflow-x:\s*hidden/);
  assert.match(adminModalCss, /overflow-y:\s*auto/);
  assert.match(adminModalCss, /grid-template-columns:\s*minmax\(260px, 1fr\) minmax\(320px, 42%\)/);
  assert.match(adminModalCss, /word-break:\s*normal/);
  assert.match(adminModalCss, /rescue-request-route-map[\s\S]+width:\s*100%/);
  assert.match(routeMapSource, /new ResizeObserver\(\(\) => map\.invalidateSize/);
});

test('Test Mode uses the standard rescue screen and keeps GPS plus staff audit labels', () => {
  assert.doesNotMatch(rescueSource, /Real out-of-area emergency request|Create Real Request|outsideLabel|outsideConfirmationVisible/);
  assert.match(rescueSource, /testModeEnabled,/);
  assert.match(rescueSource, /latitude:\s*submissionLocation\.latitude/);
  assert.match(rescueSource, /longitude:\s*submissionLocation\.longitude/);
  assert.match(reportControllerSource, /testModeEnabled:\s*geographicalBypassEnabled/);
  assert.match(reportControllerSource, /reportPresentation\.incidentType/);
  assert.doesNotMatch(reportControllerSource, /OUTSIDE_AREA_REAL_DISPATCH_CONFIRMATION_REQUIRED/);
});

test('Mark Safe has an enabled Resident Portal treatment and accessible state', () => {
  assert.match(familySource, /markBtnReady:\s*\{ backgroundColor: editorial\.accent \}/);
  assert.match(familySource, /accessibilityState=\{\{ selected: myStatus === 'Safe' \}\}/);
  assert.doesNotMatch(familySource, /myStatus === 'Safe' \? '#16a34a' : '#cbd5e1'/);
});

test('Resident web and Android weather hero use a full-card cover background', () => {
  assert.match(weatherSource, /resizeMode="cover"/);
  assert.match(weatherSource, /height:\s*126 \* scale/);
  assert.match(weatherSource, /hero:\s*\{[^\n]+width:\s*'100%'/);
  assert.match(weatherSource, /hero:\s*\{[^\n]+overflow:\s*'hidden'/);
  assert.match(weatherSource, /<View style=\{st\.heroCopy\}>[\s\S]+<View style=\{\[st\.heroArtwork/);
  assert.doesNotMatch(weatherSource, /resizeMethod="resize"/);
});
