import { ActivityIndicator, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from './Typography';

type Props = {
  visible: boolean;
  responder?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function LogoutConfirmationModal({ visible, responder = false, loading = false, onCancel, onConfirm }: Props) {
  const accent = responder ? '#1f4e79' : '#df4b1d';
  const accentSoft = responder ? '#eaf3fb' : '#fff4f0';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { if (!loading) onCancel(); }}
    >
      <Pressable style={styles.overlay} onPress={() => { if (!loading) onCancel(); }}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel="Confirm logout"
          style={styles.card}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
            <MaterialCommunityIcons name="logout-variant" size={29} color={accent} />
          </View>
          <Text style={styles.title}>Log out of CDRRMD?</Text>
          <Text style={styles.message}>Are you sure you want to log out? If you forget your login details, check the email sent when your account was created.</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>Stay signed in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.confirmButton, { backgroundColor: accent }]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <MaterialCommunityIcons name="logout" size={17} color="#fff" />
                  <Text style={styles.confirmText}>Log out</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(7, 25, 41, 0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#fff',
    shadowColor: '#071929',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  iconWrap: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: 29,
    marginBottom: 16,
  },
  title: {
    color: '#102f49',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: 9,
    color: '#52657a',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  cancelButton: {
    flex: 1,
    minHeight: 47,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  cancelText: { color: '#334155', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  confirmButton: {
    flex: 1,
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  confirmText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
