import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getRescuerTabItems, RESCUER_TABS, type RescuerTab } from '../src/rescuer/utils/rescuerTabBar.ts';

const transitions: RescuerTab[] = ['assignments', 'history', 'flood', 'account'];

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
  for (let index = 1; index < transitions.length; index += 1) {
    const previous = getRescuerTabItems(transitions[index - 1]);
    const next = getRescuerTabItems(transitions[index]);
    assert.deepEqual(next.map((item) => item.key), previous.map((item) => item.key));
    assert.notEqual(next[index - 1].iconRenderKey, previous[index - 1].iconRenderKey);
    assert.notEqual(next[index].iconRenderKey, previous[index].iconRenderKey);
    assert.equal(next[index - 1].active, false);
    assert.ok(next[index - 1].icon);
  }
});

test('portal keeps the tab bar outside screen content and does not clip icon glyphs', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(here, '../src/rescuer/RescuerPortal.tsx'), 'utf8');
  const contentIndex = source.indexOf('<View style={styles.content}>{content}</View>');
  const tabBarIndex = source.indexOf('<View style={styles.tabBar}>');
  const iconStyle = source.match(/iconWrap:\s*\{([^}]*)\}/)?.[1] || '';

  assert.ok(contentIndex >= 0);
  assert.ok(tabBarIndex > contentIndex);
  assert.doesNotMatch(iconStyle, /overflow\s*:\s*['"]hidden['"]/);
  assert.equal(RESCUER_TABS.length, 4);
});
