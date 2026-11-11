import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('WebView update handler redraws destination markers, route geometry, and bounds in place', async () => {
  const screen = await readFile(resolve(root, 'src/screens/RescueMapScreen.tsx'), 'utf8');
  assert.match(screen, /function renderRescueData\(nextData\)/);
  assert.match(screen, /areaLayer\.clearLayers\(\)/);
  assert.match(screen, /routeLayer\.clearLayers\(\)/);
  assert.match(screen, /icon: isSelected \? selectedAreaPinIcon : areaPinIcon/);
  assert.match(screen, /L\.polyline\(/);
  assert.match(screen, /map\.fitBounds\(routeBounds/);
  assert.match(screen, /document\.addEventListener\('message', receiveRescueUpdate\)/);
  assert.match(screen, /preserveState updateMessage=\{mapUpdateMessage\}/);
});

test('reduced polling applies only to idle rescue data, not live alerts or active rescue work', async () => {
  const rescue = await readFile(resolve(root, 'src/screens/RescueMapScreen.tsx'), 'utf8');
  const alerts = await readFile(resolve(root, 'src/components/ResidentFloodAlert.tsx'), 'utf8');
  const assignments = await readFile(resolve(root, 'src/rescuer/screens/AssignmentsScreen.tsx'), 'utf8');
  assert.match(rescue, /requestStarted \? 4_000 : 30_000/);
  assert.match(alerts, /setInterval\(\(\) => checkAlerts\(\)[\s\S]*?2_000\)/);
  assert.match(assignments, /setInterval\(\(\) => void refreshActive\(\), 5000\)/);
});

test('release diagnostics are opt-in and emit only sanitized operation metadata', async () => {
  const diagnostics = await readFile(resolve(root, 'src/utils/performanceDiagnostics.ts'), 'utf8');
  assert.match(diagnostics, /process\.env\.EXPO_PUBLIC_PERFORMANCE_DIAGNOSTICS === 'true'/);
  assert.match(diagnostics, /split\('\?'\)\[0\]/);
  assert.match(diagnostics, /replace\(\/\\\/\\d\+/);
  assert.match(diagnostics, /durationMs/);
  assert.doesNotMatch(diagnostics, /emit\([^\n]+(?:token|coordinates|payload|authorization)/i);
});
