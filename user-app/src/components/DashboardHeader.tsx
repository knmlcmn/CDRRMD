import type { ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from './Typography';

export function DashboardHeader({ action, backAction }: { action?: ReactNode; backAction?: ReactNode }) {
  const { width } = useWindowDimensions();
  const scale = width / 216;

  return (
    <View style={[styles.header, {
      paddingTop: 28 * scale,
      paddingBottom: 7 * scale,
      paddingHorizontal: 10 * scale,
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
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#111111', fontFamily: 'Manrope_800ExtraBold', fontWeight: '800' },
});
