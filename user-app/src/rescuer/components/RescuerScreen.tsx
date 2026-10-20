import type { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from '../../components/Typography';

export const rescuerColors = {
  navy: '#12314b',
  blue: '#1f567d',
  pale: '#eef4f8',
  ink: '#19374f',
  muted: '#64748b',
  border: '#d8e0e7',
  white: '#ffffff',
  danger: '#b91c1c',
  success: '#047857',
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
        <Text style={styles.title}>{title}</Text>
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
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.82} style={[styles.button, danger && styles.dangerButton, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: rescuerColors.pale },
  header: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#d8e0e7', paddingHorizontal: 18, paddingTop: 15, paddingBottom: 13 },
  title: { color: '#19374f', fontSize: 23, lineHeight: 29, fontWeight: '900' },
  subtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 88, gap: 11, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  error: { padding: 11, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', color: rescuerColors.danger, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 7 },
  emptyText: { color: rescuerColors.muted, fontSize: 12, textAlign: 'center' },
  button: { minHeight: 45, borderRadius: 10, backgroundColor: rescuerColors.success, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  dangerButton: { backgroundColor: rescuerColors.danger },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  detailRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  detailLabel: { width: 115, color: rescuerColors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { flex: 1, color: rescuerColors.ink, fontSize: 12, fontWeight: '600' },
});
