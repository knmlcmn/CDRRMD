import type { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from '../../components/Typography';
import { rescuerTheme } from '../theme';

export const rescuerColors = {
  navy: rescuerTheme.colors.navy900,
  blue: rescuerTheme.colors.blue700,
  pale: rescuerTheme.colors.ice,
  ink: rescuerTheme.colors.ink,
  muted: rescuerTheme.colors.muted,
  border: rescuerTheme.colors.border,
  white: rescuerTheme.colors.surface,
  danger: rescuerTheme.colors.danger,
  success: rescuerTheme.colors.success,
};

export function RescuerScreen({
  title,
  subtitle,
  children,
  refreshing = false,
  onRefresh,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.eyebrowRow}><View style={styles.eyebrowDot} /><Text style={styles.eyebrow}>OPERATIONS</Text></View>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={rescuerColors.blue} /> : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorMessage({ message }: { message?: string }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

export function EmptyState({ message, loading }: { message: string; loading?: boolean }) {
  return (
    <View style={styles.empty}>
      {loading ? <ActivityIndicator color={rescuerColors.blue} /> : <MaterialCommunityIcons name="check-circle-outline" size={27} color={rescuerColors.success} />}
      <Text style={styles.emptyText}>{loading ? 'Loading…' : message}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} activeOpacity={0.82} style={[styles.button, danger && styles.dangerButton, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: rescuerColors.pale },
  header: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: rescuerTheme.colors.border, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 15 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: rescuerTheme.colors.gold },
  eyebrow: { color: rescuerTheme.colors.blue700, fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: rescuerTheme.colors.ink, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.35 },
  subtitle: { color: rescuerTheme.colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 96, gap: 12, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: rescuerTheme.colors.border, borderRadius: 16, padding: 15, shadowColor: rescuerTheme.colors.navy950, shadowOpacity: 0.07, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  error: { padding: 11, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', color: rescuerColors.danger, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 7 },
  emptyText: { color: rescuerColors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: rescuerTheme.colors.blue700, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  dangerButton: { backgroundColor: rescuerColors.danger },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  detailRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  detailLabel: { width: 115, color: rescuerColors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { flex: 1, color: rescuerColors.ink, fontSize: 12, fontWeight: '600' },
});
