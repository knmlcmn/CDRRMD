import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getRescuerTabItems, RESCUER_TAB_INDICATOR, RESCUER_TABS, type RescuerTab } from '../src/rescuer/utils/rescuerTabBar.ts';

const transitions: RescuerTab[] = ['assignments', 'history', 'flood', 'account'];
const transitionPairs: Array<[RescuerTab, RescuerTab]> = [
  ['assignments', 'history'],
  ['history', 'flood'],
  ['flood', 'account'],
  ['account', 'assignments'],
];

test('all four rescuer icons and labels remain rendered through every tab transition', () => {
  for (const activeTab of transitions) {
    const items = getRescuerTabItems(activeTab);
    assert.equal(items.length, 4);
    assert.deepEqual(items.map((item) => item.key), transitions);
    assert.deepEqual(items.map((item) => item.mobileLabel), ['Incidents', 'History', 'Flood', 'Account']);
    assert.ok(items.every((item) => item.icon.length > 0));
    assert.equal(items.filter((item) => item.active).length, 1);
    assert.equal(items.find((item) => item.active)?.key, activeTab);
    assert.ok(items.filter((item) => !item.active).every((item) => item.iconRenderKey.endsWith(':inactive')));
  }
});

test('focus changes remount only changed icon visual states without removing tab entries', () => {
  for (const [previousTab, nextTab] of transitionPairs) {
    const previous = getRescuerTabItems(previousTab);
    const next = getRescuerTabItems(nextTab);
    assert.deepEqual(next.map((item) => item.key), previous.map((item) => item.key));
    const previousIndex = transitions.indexOf(previousTab);
    const nextIndex = transitions.indexOf(nextTab);
    assert.notEqual(next[previousIndex].iconRenderKey, previous[previousIndex].iconRenderKey);
    assert.notEqual(next[nextIndex].iconRenderKey, previous[nextIndex].iconRenderKey);
    assert.equal(next[previousIndex].active, false);
    assert.equal(next[nextIndex].active, true);
    assert.ok(next.every((item) => item.icon));
  }
});

test('active indicator keeps fixed pill geometry while icon glyphs remain unclipped', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(here, '../src/rescuer/RescuerPortal.tsx'), 'utf8');
  const contentIndex = source.indexOf('<View style={styles.content}>{content}</View>');
  const tabBarIndex = source.indexOf('<View style={styles.tabBar}>');
  const indicatorIndex = source.indexOf('style={styles.iconIndicator}');
  const fillIndex = source.indexOf('item.active ? <View style={styles.iconIndicatorFill}>', indicatorIndex);
  const iconIndex = source.indexOf('<MaterialCommunityIcons key={item.iconRenderKey}', indicatorIndex);
  const iconStyle = source.match(/iconWrap:\s*\{([^}]*)\}/)?.[1] || '';
  const indicatorStyle = source.match(/iconIndicator:\s*\{([^}]*)\}/)?.[1] || '';

  assert.ok(contentIndex >= 0);
  assert.ok(tabBarIndex > contentIndex);
  assert.ok(indicatorIndex > tabBarIndex);
  assert.ok(fillIndex > indicatorIndex);
  assert.ok(iconIndex > indicatorIndex);
  assert.doesNotMatch(iconStyle, /overflow\s*:\s*['"]hidden['"]/);
  assert.match(indicatorStyle, /\.\.\.RESCUER_TAB_INDICATOR/);
  assert.match(indicatorStyle, /overflow\s*:\s*['"]hidden['"]/);
  assert.equal(RESCUER_TAB_INDICATOR.width, 44);
  assert.equal(RESCUER_TAB_INDICATOR.height, 32);
  assert.equal(RESCUER_TAB_INDICATOR.borderRadius, RESCUER_TAB_INDICATOR.height / 2);
  assert.ok(RESCUER_TAB_INDICATOR.width > RESCUER_TAB_INDICATOR.height);
  assert.ok(Object.isFrozen(RESCUER_TAB_INDICATOR));
  assert.equal(RESCUER_TABS.length, 4);
});
