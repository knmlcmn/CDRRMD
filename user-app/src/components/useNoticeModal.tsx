import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function useNoticeModal() {
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const showNotice = useCallback((title: string, message: string) => setNotice({ title, message }), []);
  const dismiss = () => setNotice(null);
  const noticeModal = (
    <Modal visible={notice !== null} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">{notice?.title}</Text>
          <Text style={styles.message}>{notice?.message}</Text>
          <Pressable accessibilityRole="button" onPress={dismiss} style={styles.button}>
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
  return { showNotice, noticeModal };
}

export function submissionErrorNotice(error: any, fallback: string) {
  if (error?.response?.data?.code === 'OUTSIDE_BARANGAY_JURISDICTION') {
    return {
      title: 'Outside service area',
      message: 'You cannot submit this request because your location is outside the boundaries of the six supported barangays.',
    };
  }
  return { title: 'Submission failed', message: error?.response?.data?.message || fallback };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: 16, backgroundColor: '#fff', padding: 24 },
  title: { color: '#0f2948', fontSize: 21, fontWeight: '800', marginBottom: 12 },
  message: { color: '#334155', fontSize: 16, lineHeight: 24, marginBottom: 22 },
  button: { backgroundColor: '#0d3558', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
