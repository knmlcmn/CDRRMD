import { useEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text, TypographyFamily } from '../components/Typography';
import AssignmentsScreen from './screens/AssignmentsScreen';
import HistoryScreen from './screens/HistoryScreen';
import FloodMonitoringScreen from './screens/FloodMonitoringScreen';
import AccountScreen from './screens/AccountScreen';
import WaterLevelAlert from './components/WaterLevelAlert';
import { loadWaterLevelSensors, sendHeartbeat } from './services/rescuerService';
import type { ResponderRole, WaterLevelSensor } from './types';
import { MODERATE_WATER_LEVEL_THRESHOLD } from '../utils/waterLevelHazard';
import { scopeWaterLevelSensors } from './utils/sensorScope';
import { rescuerTheme } from './theme';

type Tab = 'assignments' | 'history' | 'flood' | 'account';
const tabs: Array<{ key: Tab; label: string; mobileLabel: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: 'assignments', label: 'Incident Reports', mobileLabel: 'Incidents', icon: 'alert-outline' },
  { key: 'history', label: 'History', mobileLabel: 'History', icon: 'history' },
  { key: 'flood', label: 'Flood Monitoring', mobileLabel: 'Flood', icon: 'water-outline' },
  { key: 'account', label: 'Account', mobileLabel: 'Account', icon: 'account-outline' },
];

type Props = {
  role: ResponderRole;
  barangayName?: string | null;
  onLogout: () => void;
  onAuthError: () => void;
};

export default function RescuerPortal({ role, barangayName, onLogout, onAuthError }: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 820;
  const [tab, setTab] = useState<Tab>('assignments');
  const [alertSensors, setAlertSensors] = useState<WaterLevelSensor[]>([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const alertStages = useRef<Record<string, 'moderate' | 'high'>>({});

  // Presence belongs to the portal, not only the Incidents tab. Keeping this
  // mounted means a rescuer remains assignable while viewing History, Flood,
  // or Account, and immediately refreshes presence when the APK resumes.
  useEffect(() => {
    let active = true;
    async function heartbeat() {
      if (!active || AppState.currentState !== 'active') return;
      try {
        await sendHeartbeat();
      } catch (caught: any) {
        if (caught?.response?.status === 401) onAuthError();
      }
    }
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void heartbeat();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [onAuthError]);

  useEffect(() => {
    let active = true;
    let loading = false;

    async function checkWaterLevels() {
      if (!active || loading || AppState.currentState !== 'active') return;
      loading = true;
      try {
        const loaded = await loadWaterLevelSensors();
        if (!active) return;
        const scoped = scopeWaterLevelSensors(loaded, role, barangayName);
        const hazardous = scoped
          .filter((sensor) => sensor.status === 'Active' && sensor.hasReading
            && sensor.waterLevelPercentage >= MODERATE_WATER_LEVEL_THRESHOLD)
          .sort((first, second) => second.waterLevelPercentage - first.waterLevelPercentage);
        const hazardousIds = new Set(hazardous.map((sensor) => sensor.id));
        let changed = false;

        hazardous.forEach((sensor) => {
          const stage = sensor.waterLevelPercentage >= 61 ? 'high' : 'moderate';
          if (alertStages.current[sensor.id] !== stage) changed = true;
          alertStages.current[sensor.id] = stage;
        });
        Object.keys(alertStages.current).forEach((sensorId) => {
          if (!hazardousIds.has(sensorId)) delete alertStages.current[sensorId];
        });

        if (changed && hazardous.length > 0) {
          setAlertSensors(hazardous);
          setAlertVisible(true);
        }
      } catch (caught: any) {
        if (caught?.response?.status === 401) onAuthError();
      } finally {
        loading = false;
      }
    }

    void checkWaterLevels();
    const timer = setInterval(() => void checkWaterLevels(), 3_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkWaterLevels();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [barangayName, onAuthError, role]);

  const content = tab === 'history'
    ? <HistoryScreen role={role} onAuthError={onAuthError} />
    : tab === 'flood'
      ? <FloodMonitoringScreen role={role} barangayName={barangayName} onAuthError={onAuthError} />
      : tab === 'account'
        ? <AccountScreen role={role} onAuthError={onAuthError} />
        : <AssignmentsScreen role={role} onAuthError={onAuthError} />;

  return (
    <TypographyFamily family="Manrope">
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {!desktop ? <View style={styles.mobileTop}>
        <View pointerEvents="none" style={[styles.mobilePatternArc, styles.mobilePatternTop]} />
        <View style={styles.brandWrap}>
          <Image source={require('../../assets/cdrrmd-logo.png')} style={styles.logo} />
          <View><Text style={styles.mobileBrand}>{role === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer'}</Text><Text style={styles.portalLabel}>RESPONDER PORTAL</Text></View>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Log out" onPress={onLogout} style={styles.mobileLogout}><MaterialCommunityIcons name="logout" size={20} color="#ffffff" /></TouchableOpacity>
      </View> : null}
      <View style={styles.layout}>
        {desktop ? <View style={styles.sidebar}>
          <View style={styles.desktopBrand}><Image source={require('../../assets/cdrrmd-logo.png')} style={styles.logo} /><View><Text style={styles.desktopBrandTitle}>CDRRMD</Text><Text style={styles.desktopBrandRole}>{role === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer'}</Text></View></View>
          <View style={styles.sideNav}>{tabs.map((item) => {
            const active = tab === item.key;
            return <TouchableOpacity key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.key)} style={[styles.sideNavItem, active && styles.sideNavItemActive]}>{active ? <View style={styles.activeRail} /> : null}<MaterialCommunityIcons name={item.icon} size={20} color={active ? '#fff' : '#b9d4e6'} /><Text style={[styles.sideNavLabel, !active && styles.sideNavLabelIdle]}>{item.label}</Text></TouchableOpacity>;
          })}</View>
          <TouchableOpacity onPress={onLogout} style={styles.desktopLogout}><MaterialCommunityIcons name="logout" size={19} color="#fff" /><Text style={styles.sideNavLabel}>Logout</Text></TouchableOpacity>
        </View> : null}
        <View style={styles.content}>{content}</View>
      </View>
      {!desktop ? <View style={styles.tabBar}>
        <View pointerEvents="none" style={[styles.mobilePatternArc, styles.mobilePatternBottom]} />
        {tabs.map((item) => {
          const active = tab === item.key;
          return <TouchableOpacity key={item.key} onPress={() => setTab(item.key)} style={styles.tab} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}><MaterialCommunityIcons name={item.icon} size={22} color={active ? '#fff' : '#c7e3f5'} /></View>
            <Text numberOfLines={1} style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.mobileLabel}</Text>
          </TouchableOpacity>;
        })}
      </View> : null}
      <WaterLevelAlert
        sensors={alertSensors}
        visible={alertVisible}
        onClose={() => setAlertVisible(false)}
        onSeeDetails={() => {
          setAlertVisible(false);
          setTab('flood');
        }}
      />
    </SafeAreaView>
    </TypographyFamily>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: rescuerTheme.colors.surface },
  layout: { flex: 1, flexDirection: 'row' },
  content: { flex: 1 },
  mobileTop: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden', backgroundColor: rescuerTheme.colors.navy900, borderBottomWidth: 1, borderBottomColor: '#315b78' },
  mobilePatternArc: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(116,187,229,0.16)' },
  mobilePatternTop: { width: 190, height: 120, right: -55, top: -55, borderRadius: 80, transform: [{ rotate: '-12deg' }] },
  mobilePatternBottom: { width: 230, height: 120, left: -65, bottom: -76, borderRadius: 100, transform: [{ rotate: '8deg' }] },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: rescuerTheme.colors.gold, backgroundColor: '#fff' },
  mobileBrand: { color: '#ffffff', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  portalLabel: { color: '#b9def2', fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 1.2 },
  mobileLogout: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  sidebar: { width: 236, padding: 16, backgroundColor: rescuerTheme.colors.navy900, borderRightWidth: 1, borderRightColor: '#244d6b', gap: 18 },
  desktopBrand: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#486581', backgroundColor: '#163b60' },
  desktopBrandTitle: { color: '#fff', fontSize: 18, lineHeight: 21, fontWeight: '900' },
  desktopBrandRole: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  sideNav: { gap: 10 },
  sideNavItem: { position: 'relative', minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderRadius: 13, overflow: 'hidden' },
  sideNavItemActive: { backgroundColor: rescuerTheme.colors.blue700 },
  activeRail: { position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 3, backgroundColor: rescuerTheme.colors.gold },
  sideNavLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sideNavLabelIdle: { color: '#d7e5ef' },
  desktopLogout: { marginTop: 'auto', minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, borderWidth: 1, borderColor: '#486581' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 7, overflow: 'hidden', backgroundColor: rescuerTheme.colors.navy900, borderTopWidth: 1, borderTopColor: '#315b78', shadowColor: rescuerTheme.colors.navy950, shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: -3 }, elevation: 10 },
  tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  iconWrap: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconWrapActive: { backgroundColor: rescuerTheme.colors.blue600, borderLeftWidth: 3, borderLeftColor: rescuerTheme.colors.gold },
  tabLabel: { color: '#c7e3f5', fontSize: 9, lineHeight: 11, fontWeight: '800', textAlign: 'center' },
  tabLabelActive: { color: '#ffffff' },
});
