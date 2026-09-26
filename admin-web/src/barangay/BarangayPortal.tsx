import { useCallback, useEffect, useRef, useState } from 'react';
import MonitoringPage from './pages/MonitoringPage';
import AccountPage from './pages/AccountPage';
import FloodMonitoringPage from './pages/FloodMonitoringPage';
import WaterLevelAlert, { type WaterLevelNoticeKind } from './components/WaterLevelAlert';
import BackupModal from './components/BackupModal';
import { API_BASE_URL, api, setAuthToken } from '../services/apiClient';
import { loadWaterLevelSensors, type WaterLevelSensor } from './services/waterLevelSensors';

type View = 'monitoring' | 'flood-monitoring' | 'account';
type RescueRequestNotice = {
  id: number;
  report_code?: string | null;
  location: string;
  incident_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_number?: string | null;
  status: string;
  created_at: string;
};

type Props = {
  token: string;
  barangayName: string;
  onLogout: () => void;
  onAuthError: () => void;
};

export default function BarangayPortal({ token, barangayName, onLogout, onAuthError }: Props) {
  const [view, setView] = useState<View>('monitoring');
  const [pendingRescueRequests, setPendingRescueRequests] = useState<RescueRequestNotice[]>([]);
  const [dismissedRescueIds, setDismissedRescueIds] = useState<Set<number>>(() => new Set());
  const [focusReportId, setFocusReportId] = useState<number | null>(null);
  const [notices, setNotices] = useState<Array<{ id: number; alert: WaterLevelSensor; kind: WaterLevelNoticeKind }>>([]);
  const noticeIdRef = useRef(0);
  const reminderTimerRef = useRef<number | null>(null);
  const lastWarningLevelRef = useRef<number | null>(null);

  const showNotice = useCallback((alert: WaterLevelSensor, kind: WaterLevelNoticeKind) => {
    setNotices([{ id: ++noticeIdRef.current, alert, kind }]);
  }, []);

  useEffect(() => {
    setAuthToken(token);
    return () => setAuthToken(null);
  }, [token]);

  useEffect(() => {
    let stopped = false;
    const checkRescueRequests = async () => {
      try {
        const { data } = await api.get<RescueRequestNotice[]>('/barangay/reports/mine');
        if (stopped) return;
        setPendingRescueRequests((Array.isArray(data) ? data : []).filter((report) =>
          String(report.status || '').toLowerCase() === 'pending'
        ));
      } catch (error: any) {
        if (error?.response?.status === 401) onAuthError();
      }
    };
    void checkRescueRequests();
    const timer = window.setInterval(() => void checkRescueRequests(), 2_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [onAuthError, token]);

  useEffect(() => {
    let stopped = false;
    const sendHeartbeat = () => { if (!stopped) api.post('/barangay/presence/heartbeat').catch(() => {}); };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 15_000);
    document.addEventListener('visibilitychange', sendHeartbeat);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sendHeartbeat);
    };
  }, [token]);

  useEffect(() => {
    let stopped = false;
    const normalizedBarangay = barangayName.trim().toLowerCase();
    const checkWaterLevel = async () => {
      const sensors = await loadWaterLevelSensors();
      if (stopped) return;
      const ownSensor = sensors.find((sensor) => sensor.barangayName.toLowerCase() === normalizedBarangay);
      const warning = Boolean(ownSensor?.status === 'Active' && ownSensor.hasReading && ownSensor.waterLevelPercentage >= 40);
      if (!ownSensor || !warning) {
        lastWarningLevelRef.current = null;
        setNotices([]);
        if (reminderTimerRef.current !== null) window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = null;
        return;
      }
      const lastLevel = lastWarningLevelRef.current;
      if (lastLevel === null || ownSensor.waterLevelPercentage >= lastLevel + 10) {
        lastWarningLevelRef.current = ownSensor.waterLevelPercentage;
        showNotice(ownSensor, 'warning');
        if (reminderTimerRef.current !== null) window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = window.setTimeout(() => {
          loadWaterLevelSensors().then((current) => {
            const sensor = current.find((item) => item.barangayName.toLowerCase() === normalizedBarangay);
            if (!stopped && sensor?.status === 'Active' && sensor.hasReading && sensor.waterLevelPercentage >= 40) showNotice(sensor, 'reminder');
          }).catch(() => {});
        }, 8_500);
      }
    };
    void checkWaterLevel();
    const timer = window.setInterval(() => void checkWaterLevel(), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (reminderTimerRef.current !== null) window.clearTimeout(reminderTimerRef.current);
    };
  }, [barangayName, showNotice, token]);

  useEffect(() => {
    const markOffline = () => {
      const blob = new Blob([JSON.stringify({ token })], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE_URL.replace(/\/$/, '')}/barangay/presence/offline`, blob);
    };
    window.addEventListener('pagehide', markOffline);
    return () => window.removeEventListener('pagehide', markOffline);
  }, [token]);

  const activeNotice = notices[0];
  const popup = activeNotice ? <WaterLevelAlert key={activeNotice.id} alert={activeNotice.alert} kind={activeNotice.kind} onClose={() => setNotices((current) => current.filter((item) => item.id !== activeNotice.id))} /> : null;
  const activeRescueRequest = pendingRescueRequests.find((request) => !dismissedRescueIds.has(request.id)) || null;
  const rescuePopup = activeRescueRequest ? (
    <BackupModal title="New Resident Rescue Request" onClose={() => setDismissedRescueIds((current) => new Set(current).add(activeRescueRequest.id))}>
      <p><strong>Request:</strong> {activeRescueRequest.report_code || `RPT-${String(activeRescueRequest.id).padStart(6, '0')}`}</p>
      <p><strong>Incident:</strong> {String(activeRescueRequest.incident_type || 'Request Rescue').replace(/_/g, ' ')}</p>
      <p><strong>Location:</strong> {activeRescueRequest.location}</p>
      <p><strong>Resident:</strong> {[activeRescueRequest.first_name, activeRescueRequest.last_name].filter(Boolean).join(' ') || '-'}</p>
      <p><strong>Contact:</strong> {activeRescueRequest.contact_number || '-'}</p>
      <p><strong>Submitted:</strong> {new Date(activeRescueRequest.created_at).toLocaleString()}</p>
      <p>This rescue request must be accepted or declined by Barangay {barangayName}.</p>
      <div className="backup-actions">
        <button className="backup-button backup-button-secondary" onClick={() => setDismissedRescueIds((current) => new Set(current).add(activeRescueRequest.id))}>Dismiss</button>
        <button className="backup-button" onClick={() => {
          setDismissedRescueIds((current) => new Set(current).add(activeRescueRequest.id));
          setFocusReportId(activeRescueRequest.id);
          setView('monitoring');
        }}>Review Request</button>
      </div>
    </BackupModal>
  ) : null;
  const pageProps = { barangayName, onLogout, onAuthError };

  return (
    <>
      {rescuePopup || popup}
      {view === 'account' ? <AccountPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} /> : null}
      {view === 'flood-monitoring' ? <FloodMonitoringPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenAccount={() => setView('account')} /> : null}
      {view === 'monitoring' ? <MonitoringPage {...pageProps} focusReportId={focusReportId} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenAccount={() => setView('account')} /> : null}
    </>
  );
}
