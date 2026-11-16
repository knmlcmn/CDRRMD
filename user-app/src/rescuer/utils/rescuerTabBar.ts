export type RescuerTab = 'assignments' | 'history' | 'flood' | 'account';

export const RESCUER_TABS = [
  { key: 'assignments', label: 'Incident Reports', mobileLabel: 'Incidents', icon: 'alert-outline' },
  { key: 'history', label: 'History', mobileLabel: 'History', icon: 'history' },
  { key: 'flood', label: 'Flood Monitoring', mobileLabel: 'Flood', icon: 'water-outline' },
  { key: 'account', label: 'Account', mobileLabel: 'Account', icon: 'account-outline' },
] as const;

export const RESCUER_TAB_INDICATOR = Object.freeze({
  width: 44,
  height: 32,
  borderRadius: 16,
});

export function getRescuerTabItems(activeTab: RescuerTab) {
  return RESCUER_TABS.map((item) => {
    const active = item.key === activeTab;
    return {
      ...item,
      active,
      // Remount the native font glyph when its visual state changes. Android
      // can otherwise retain the clipped active text layer after focus moves.
      iconRenderKey: `${item.key}:${active ? 'active' : 'inactive'}`,
    };
  });
}
