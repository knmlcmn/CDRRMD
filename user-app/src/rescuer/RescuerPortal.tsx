import { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text, TypographyFamily } from '../components/Typography';
import AssignmentsScreen from './screens/AssignmentsScreen';
import HistoryScreen from './screens/HistoryScreen';
import FloodMonitoringScreen from './screens/FloodMonitoringScreen';
import AccountScreen from './screens/AccountScreen';
import type { ResponderRole } from './types';
import { rescuerColors } from './components/RescuerScreen';

type Tab = 'assignments' | 'history' | 'flood' | 'account';
const tabs: Array<{ key: Tab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: 'assignments', label: 'Incident Reports', icon: 'alert-outline' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'flood', label: 'Flood Monitoring', icon: 'water-outline' },
  { key: 'account', label: 'Account', icon: 'account-outline' },
];

export default function RescuerPortal({ role, onLogout, onAuthError }: { role: ResponderRole; onLogout: () => void; onAuthError: () => void }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 820;
  const [tab, setTab] = useState<Tab>('assignments');
  const content = tab === 'history'
    ? <HistoryScreen role={role} onAuthError={onAuthError} />
    : tab === 'flood'
      ? <FloodMonitoringScreen onAuthError={onAuthError} />
      : tab === 'account'
        ? <AccountScreen role={role} onAuthError={onAuthError} />
        : <AssignmentsScreen role={role} onAuthError={onAuthError} />;

  return (
    <TypographyFamily family="Manrope">
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {!desktop ? <View style={styles.mobileTop}>
        <View style={styles.brandWrap}>
          <Image source={require('../../assets/cdrrmd-logo.png')} style={styles.logo} />
          <View><Text style={styles.mobileBrand}>{role === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer'}</Text><Text style={styles.portalLabel}>RESPONDER PORTAL</Text></View>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.mobileLogout}><Text style={styles.mobileLogoutText}>Logout</Text></TouchableOpacity>
      </View> : null}
      <View style={styles.layout}>
        {desktop ? <View style={styles.sidebar}>
          <View style={styles.desktopBrand}><Image source={require('../../assets/cdrrmd-logo.png')} style={styles.logo} /><View><Text style={styles.desktopBrandTitle}>CDRRMD</Text><Text style={styles.desktopBrandRole}>{role === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer'}</Text></View></View>
          <View style={styles.sideNav}>{tabs.map((item) => {
            const active = tab === item.key;
            return <TouchableOpacity key={item.key} onPress={() => setTab(item.key)} style={[styles.sideNavItem, active && styles.sideNavItemActive]}><MaterialCommunityIcons name={item.icon} size={20} color="#fff" /><Text style={styles.sideNavLabel}>{item.label}</Text></TouchableOpacity>;
          })}</View>
          <TouchableOpacity onPress={onLogout} style={styles.desktopLogout}><MaterialCommunityIcons name="logout" size={19} color="#fff" /><Text style={styles.sideNavLabel}>Logout</Text></TouchableOpacity>
        </View> : null}
        <View style={styles.content}>{content}</View>
      </View>
      {!desktop ? <View style={styles.tabBar}>
        {tabs.map((item) => {
          const active = tab === item.key;
          return <TouchableOpacity key={item.key} onPress={() => setTab(item.key)} style={styles.tab} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}><MaterialCommunityIcons name={item.icon} size={22} color={active ? '#fff' : rescuerColors.blue} /></View>
          </TouchableOpacity>;
        })}
      </View> : null}
    </SafeAreaView>
    </TypographyFamily>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  layout: { flex: 1, flexDirection: 'row' },
  content: { flex: 1 },
  mobileTop: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#f4b400', backgroundColor: '#fff' },
  mobileBrand: { color: '#0b2e4e', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  portalLabel: { color: '#2a5d8d', fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 1.2 },
  mobileLogout: { borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  mobileLogoutText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  sidebar: { width: 228, padding: 16, backgroundColor: '#0b2e4e', borderRightWidth: 1, borderRightColor: '#334155', gap: 16 },
  desktopBrand: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#486581', backgroundColor: '#163b60' },
  desktopBrandTitle: { color: '#fff', fontSize: 18, lineHeight: 21, fontWeight: '900' },
  desktopBrandRole: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  sideNav: { gap: 10 },
  sideNavItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12 },
  sideNavItemActive: { backgroundColor: '#2a5d8d' },
  sideNavLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
  desktopLogout: { marginTop: 'auto', minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, borderWidth: 1, borderColor: '#486581' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#cbd5e1', shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: -2 }, elevation: 10 },
  tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 46, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: '#1f4e79' },
});
