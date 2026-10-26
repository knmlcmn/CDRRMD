import type { ReactNode } from 'react';
import { Image, ImageBackground, StyleSheet, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from './Typography';

export const authColors = {
  navy: '#082b49',
  navySoft: '#123f63',
  blue: '#1f6699',
  ice: '#eef6fb',
  ink: '#102f49',
  muted: '#60758a',
  border: '#cbdce8',
  gold: '#d8aa2b',
  white: '#ffffff',
  danger: '#b4232d',
};

export function AuthShell({ children, title, subtitle, centerContent = false }: { children: ReactNode; title: string; subtitle: string; centerContent?: boolean }) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;

  return (
    <View style={[styles.root, wide && styles.rootWide]}>
      <ImageBackground
        source={require('../../assets/Calamba_City_Hall_(Chipeco_Ave.,_Calamba,_Laguna)(2018-08-21).jpg')}
        resizeMode="cover"
        style={[styles.hero, wide && styles.heroWide]}
        imageStyle={styles.heroImage}
      >
        <View style={styles.heroOverlay} />
        <View pointerEvents="none" style={styles.gridPattern} />
        <View style={styles.brandRow}>
          <View style={[styles.sealWrap, wide && styles.sealWrapWide]}><Image source={require('../../assets/cdrrmd-logo.png')} style={[styles.seal, wide && styles.sealWide]} /></View>
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>CDRRMD</Text>
            <Text style={styles.brandSub}>CALAMBA CITY</Text>
          </View>
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.accessPill}><MaterialCommunityIcons name="shield-account-outline" size={15} color="#ffe39b" /><Text style={styles.accessText}>COMMUNITY & RESPONDER ACCESS</Text></View>
          <Text style={styles.heroTitle}>Prepared communities. Coordinated response.</Text>
          <Text style={styles.heroText}>Official access for residents and authorized emergency response personnel.</Text>
        </View>
        <Text style={styles.heroFooter}>CITY DISASTER RISK REDUCTION AND MANAGEMENT DIVISION</Text>
      </ImageBackground>

      <View style={[styles.formPane, wide && styles.formPaneWide]}>
        <View style={[styles.formBody, centerContent && styles.formBodyCentered]}>
        <View style={styles.formHeading}>
          <View style={styles.headingIcon}><MaterialCommunityIcons name="shield-check-outline" size={21} color={authColors.blue} /></View>
          <View style={styles.headingCopy}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
        </View>
        {children}
        </View>
        <Text style={styles.footer}>Official CDRRMD mobile service · Authorized access only</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: authColors.ice },
  rootWide: { flexDirection: 'row' },
  hero: { minHeight: 166, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 13, justifyContent: 'space-between', overflow: 'hidden' },
  heroWide: { width: '44%', minHeight: '100%', paddingHorizontal: 34, paddingVertical: 30 },
  heroImage: { opacity: 0.98 },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 35, 61, 0.84)' },
  gridPattern: { position: 'absolute', width: 240, height: 240, right: -75, top: -80, borderWidth: 1, borderColor: 'rgba(137, 205, 242, 0.2)', borderRadius: 120, transform: [{ scaleX: 1.3 }] },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sealWrap: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)', backgroundColor: 'rgba(255,255,255,0.12)' },
  sealWrapWide: { width: 52, height: 52, borderRadius: 16 },
  seal: { width: 51, height: 51 },
  sealWide: { width: 42, height: 42 },
  brandCopy: { flex: 1 },
  brand: { color: '#fff', fontSize: 21, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4 },
  brandSub: { color: '#bce1f7', fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 2.1 },
  heroCopy: { maxWidth: 440, marginTop: 10 },
  accessPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(6, 28, 48, 0.6)', borderWidth: 1, borderColor: 'rgba(255, 227, 155, 0.3)' },
  accessText: { color: '#ffe39b', fontSize: 8, fontWeight: '900', letterSpacing: 1.05 },
  heroTitle: { color: '#fff', maxWidth: 390, marginTop: 8, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.5 },
  heroText: { color: '#dcecf7', maxWidth: 420, marginTop: 6, fontSize: 11, lineHeight: 17 },
  heroFooter: { display: 'none', color: '#bcd5e5', fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  formPane: { flex: 1, width: '100%', maxWidth: 660, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  formPaneWide: { justifyContent: 'center', paddingHorizontal: 48, paddingVertical: 28 },
  formBody: { width: '100%' },
  formBodyCentered: { flex: 1, justifyContent: 'center' },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  headingIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#e3f1fa', borderWidth: 1, borderColor: '#c5dfef' },
  headingCopy: { flex: 1 },
  title: { color: authColors.ink, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.45 },
  subtitle: { color: authColors.muted, marginTop: 2, fontSize: 11, lineHeight: 16 },
  footer: { color: '#7a8da0', marginTop: 8, textAlign: 'center', fontSize: 9, lineHeight: 13, fontWeight: '700' },
});

