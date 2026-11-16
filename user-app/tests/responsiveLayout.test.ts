import assert from 'node:assert/strict';
import test from 'node:test';
import { getResponsiveMode, RESPONSIVE_BREAKPOINTS } from '../src/utils/responsivePolicy.ts';

test('responsive layout policy covers representative portal widths', () => {
  assert.deepEqual(RESPONSIVE_BREAKPOINTS, { tablet: 768, desktop: 1024 });
  assert.equal(getResponsiveMode(390), 'mobile');
  assert.equal(getResponsiveMode(768), 'tablet');
  assert.equal(getResponsiveMode(1023), 'tablet');
  assert.equal(getResponsiveMode(1024), 'desktop');
  assert.equal(getResponsiveMode(1440), 'desktop');
});
