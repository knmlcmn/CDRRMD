import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPopulationDensityMapRuntimeScript } from '../src/utils/populationDensityMapRuntime.ts';

test('population density runtime derives a server-gated endpoint and starts hidden', () => {
  const script = buildPopulationDensityMapRuntimeScript('payload.barangayBoundaryGeoJsonUrl');
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /\/gis\/population-density/);
  assert.match(script, /populationVisible = false/);
  assert.match(script, /responsePayload\.defaultVisibility !== false/);
  assert.match(script, /setPopulationVisible\(false\)/);
});

test('population density runtime preserves source attribution and derived-data labels', () => {
  const script = buildPopulationDensityMapRuntimeScript('data.floodHazardUrl');
  assert.match(script, /Density is derived, not PSA-published/);
  assert.match(script, /PSA 2024 POPCEN/);
  assert.match(script, /Calamba barangay profile/);
  assert.match(script, /visualization only and was not used to calculate area/);
  assert.match(script, /Area allocation remains subject to CLUP reconciliation/);
});

test('population density runtime is independent from hardware and rescue visibility state', () => {
  const script = buildPopulationDensityMapRuntimeScript('payload.barangayBoundaryGeoJsonUrl');
  assert.doesNotMatch(script, /visibility\.floodHazard\s*=/);
  assert.doesNotMatch(script, /hardwareFlood/);
  assert.doesNotMatch(script, /responderRoute/);
});

test('population density runtime rejects executable expressions and supports jurisdiction scoping', () => {
  assert.throws(
    () => buildPopulationDensityMapRuntimeScript('payload.url; deploy()'),
    /trusted property expression/,
  );
  const script = buildPopulationDensityMapRuntimeScript(
    'payload.barangayBoundaryGeoJsonUrl',
    'mapBehavior.jurisdictionBarangayName',
  );
  assert.match(script, /var jurisdictionName = mapBehavior\.jurisdictionBarangayName/);
  assert.match(script, /normalizePopulationBarangay\(jurisdictionName\)/);
});

test('rescuer standalone control is current-dataset-only and identifies PSA 2024', () => {
  const script = buildPopulationDensityMapRuntimeScript(
    'payload.barangayBoundaryGeoJsonUrl',
    'null',
    true,
  );
  assert.match(script, /standaloneControlEnabled = true/);
  assert.match(script, /Population Density — PSA 2024 POPCEN/);
  assert.doesNotMatch(script, /<select|year-selector|historical population|population trend|edit population/i);
});
