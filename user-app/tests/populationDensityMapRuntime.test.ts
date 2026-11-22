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

test('population density runtime renders only compact derived-density popup details', () => {
  const script = buildPopulationDensityMapRuntimeScript('data.floodHazardUrl');
  assert.match(script, /Derived population density/);
  assert.match(script, /Math\.round/);
  assert.match(script, /people\/km&sup2;/);
  assert.match(script, /Population count:/);
  assert.match(script, /Data year:/);
  assert.match(script, /PSA 2024 POPCEN/);
  assert.match(script, /Calamba City Government/);
  assert.doesNotMatch(script, /<table|Formula:|Published area|CLUP caveat|Area note:|visualization only/);
  assert.doesNotMatch(script, /bindTooltip/);
});

test('population density runtime does not create a separate floating legend', () => {
  const script = buildPopulationDensityMapRuntimeScript('data.floodHazardUrl');
  assert.doesNotMatch(script, /populationLegend|showPopulationLegend|removePopulationLegend/);
  assert.doesNotMatch(script, /L\.control\(\{ position: 'bottomright' \}\)/);
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
