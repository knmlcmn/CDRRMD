import { useEffect } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, Vibration, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from '../../components/Typography';
import type { WaterLevelSensor } from '../types';
import { HIGH_WATER_LEVEL_THRESHOLD } from '../../utils/waterLevelHazard';

type Props = {
  sensors: WaterLevelSensor[];
  visible: boolean;
  onClose: () => void;
  onSeeDetails: () => void;
};

export default function WaterLevelAlert({ sensors, visible, onClose, onSeeDetails }: Props) {
  useEffect(() => {
    if (!visible) return undefined;
    Vibration.vibrate([0, 350, 160, 500]);
    return () => Vibration.cancel();
  }, [visible]);

  const highCount = sensors.filter((sensor) => sensor.waterLevelPercentage >= HIGH_WATER_LEVEL_THRESHOLD).length;
  const high = highCount > 0;
  const headline = highCount > 0 ? 'High water-level warning' : 'Moderate water-level warning';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, high ? styles.highCard : styles.moderateCard]} accessibilityRole="alert">
          <View style={[styles.alertIcon, high ? styles.highIcon : styles.moderateIcon]}>
            <MaterialCommunityIcons name="alert" size={31} color="#ffffff" />
          </View>
          <View style={styles.content}>
            <Text style={[styles.eyebrow, high ? styles.highAccentText : styles.moderateAccentText]}>URGENT WATER-LEVEL ALERT</Text>
            <Text style={[styles.title, high ? styles.highTitle : styles.moderateTitle]}>{headline}</Text>
            <Text style={styles.message}>
              {sensors.length === 1
                ? `The sensor in Barangay ${sensors[0].barangayName} reached ${sensors[0].waterLevelPercentage.toFixed(0)}%.`
                : `${sensors.length} barangay sensors are currently at moderate or high water levels.`}
            </Text>
            <ScrollView style={styles.readings} contentContainerStyle={styles.readingsContent} nestedScrollEnabled>
              {sensors.map((sensor) => {
                const high = sensor.waterLevelPercentage >= HIGH_WATER_LEVEL_THRESHOLD;
                return (
                  <View key={sensor.id} style={styles.readingRow}>
                    <View style={[styles.levelDot, high ? styles.highDot : styles.moderateDot]} />
                    <Text style={styles.barangay} numberOfLines={1}>Barangay {sensor.barangayName}</Text>
                    <Text style={[styles.percentage, high ? styles.highText : styles.moderateText]}>
                      {sensor.waterLevelPercentage.toFixed(0)}% {high ? 'High' : 'Moderate'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[styles.detailsButton, high ? styles.highButton : styles.moderateButton]} onPress={onSeeDetails} accessibilityRole="button">
              <Text style={styles.detailsText}>See details</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="Close water-level alert">
            <MaterialCommunityIcons name="close" size={24} color={high ? '#991b1b' : '#92400e'} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 82,
    paddingBottom: 82,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 530,
    maxHeight: '78%',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 14,
    borderWidth: 3,
    borderRadius: 22,
    padding: 19,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  highCard: { borderColor: '#ef4444', backgroundColor: '#fff1f2', shadowColor: '#991b1b' },
  moderateCard: { borderColor: '#f59e0b', backgroundColor: '#fffbeb', shadowColor: '#b45309' },
  alertIcon: {
    width: 60,
    height: 60,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  highIcon: { backgroundColor: '#ef2626', shadowColor: '#dc2626' },
  moderateIcon: { backgroundColor: '#f59e0b', shadowColor: '#d97706' },
  content: { flex: 1, minWidth: 0, paddingTop: 3 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.2 },
  highAccentText: { color: '#c81e1e' },
  moderateAccentText: { color: '#b45309' },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 2 },
  highTitle: { color: '#521b17' },
  moderateTitle: { color: '#78350f' },
  message: { color: '#5f636d', fontSize: 14, lineHeight: 21, marginTop: 6 },
  readings: { maxHeight: 155, marginTop: 10 },
  readingsContent: { gap: 7 },
  readingRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  levelDot: { width: 9, height: 9, borderRadius: 5 },
  highDot: { backgroundColor: '#dc2626' },
  moderateDot: { backgroundColor: '#f59e0b' },
  barangay: { flex: 1, color: '#521b17', fontSize: 12, fontWeight: '800' },
  percentage: { fontSize: 11, fontWeight: '900' },
  highText: { color: '#dc2626' },
  moderateText: { color: '#b45309' },
  detailsButton: {
    alignSelf: 'center',
    minHeight: 43,
    justifyContent: 'center',
    marginTop: 13,
    paddingHorizontal: 17,
    borderRadius: 10,
  },
  highButton: { backgroundColor: '#c81e1e' },
  moderateButton: { backgroundColor: '#d97706' },
  detailsText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginTop: -2, marginRight: -5 },
});
