import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText as Text } from './Typography';
import { useResponsiveLayout, WEB_DESKTOP_CONTENT_WIDTH } from '../utils/responsive';

export function DashboardHeader({ action, backAction }: { action?: ReactNode; backAction?: ReactNode }) {
  const { uiScale: scale, horizontalPadding, isWebDesktop } = useResponsiveLayout();

  return (
    <View style={styles.shell}>
      <View style={[styles.header, {
        maxWidth: isWebDesktop ? WEB_DESKTOP_CONTENT_WIDTH : 760,
        paddingTop: 28 * scale,
        paddingBottom: 7 * scale,
        paddingHorizontal: Math.max(horizontalPadding, 10 * scale),
        }]}>
        <View style={styles.brand}>
          {backAction}
          <Image
            source={require('../../assets/cdrrmd-logo.png')}
            style={{
              width: 23 * scale,
              height: 23 * scale,
              borderRadius: 11.5 * scale,
              marginRight: 5 * scale,
            }}
          />
          <Text style={[styles.title, { fontSize: 11 * scale }]}>CDRRMD</Text>
        </View>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%', backgroundColor: '#ffffff' },
  header: {
    width: '100%', maxWidth: 760, boxSizing: 'border-box', alignSelf: 'center',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#111111', fontFamily: 'Sora_800ExtraBold', fontWeight: '800' },
});
