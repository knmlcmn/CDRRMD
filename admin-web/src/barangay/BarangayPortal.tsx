import { useCallback, useEffect, useRef, useState } from 'react';
import MonitoringPage from './pages/MonitoringPage';
import PersonnelAccountsPage from './pages/PersonnelAccountsPage';
import FloodMonitoringPage from './pages/FloodMonitoringPage';
import EvacuationCenterPage from './pages/EvacuationCenterPage';
import DashboardPage from './pages/DashboardPage';
import WaterLevelAlert, { type WaterLevelNoticeKind } from './components/WaterLevelAlert';
import BackupModal from './components/BackupModal';
import { API_BASE_URL, api, setAuthToken } from '../services/apiClient';
import { loadWaterLevelSensors, type WaterLevelSensor } from './services/waterLevelSensors';

type View = 'dashboard' | 'monitoring' | 'flood-monitoring' | 'evacuation-center' | 'account';
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
  const [view, setView] = useState<View>('dashboard');
  const [pendingRescueRequests, setPendingRescueRequests] = useState<RescueRequestNotice[]>([]);
  const [dismissedRescueIds, setDismissedRescueIds] = useState<Set<number>>(() => new Set());
  const [rescueDecisionId, setRescueDecisionId] = useState<number | null>(null);
  const [rescueDecisionError, setRescueDecisionError] = useState('');
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
      } catch (error: unknown) {
        if ((error as { response?: { status?: number } })?.response?.status === 401) onAuthError();
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

  const decideRescueRequest = async (request: RescueRequestNotice, decision: 'accepted' | 'declined') => {
    if (rescueDecisionId !== null) return;
    setRescueDecisionId(request.id);
    setRescueDecisionError('');
    try {
      await api.patch(`/barangay/reports/${request.id}/status`, decision === 'accepted'
        ? {
            status: 'accepted',
            notes: `Barangay ${barangayName} confirmed dispatch from the resident rescue notification.`,
          }
        : {
            status: 'declined',
            declineReason: 'other',
            declineExplanation: `Barangay ${barangayName} dismissed the resident rescue request from the notification.`,
          });
      setPendingRescueRequests((current) => current.filter((item) => item.id !== request.id));
      setDismissedRescueIds((current) => new Set(current).add(request.id));
      setFocusReportId(request.id);
    } catch (error: unknown) {
      const apiError = error as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setRescueDecisionError(apiError.response?.data?.message || 'Unable to update this rescue request. Please try again.');
    } finally {
      setRescueDecisionId(null);
    }
  };

  const rescuePopup = activeRescueRequest ? (
    <BackupModal title="New Resident Rescue Request" variant="rescue-request" onClose={() => {}}>
      <div className="rescue-request-layout">
        <div>
          <p className="rescue-request-eyebrow">New Resident Rescue Request</p>
          <h2 className="rescue-request-title">Barangay {barangayName}</h2>
          <p className="rescue-request-subtitle">{String(activeRescueRequest.incident_type || 'Emergency rescue').replace(/_/g, ' ')}</p>
          <p className="rescue-request-description">
            A resident has requested immediate rescue at {activeRescueRequest.location}. Confirm dispatch to accept the request and automatically assign the nearest available Barangay Rescuer.
          </p>
          <p className="rescue-request-meta">
            {activeRescueRequest.report_code || `RPT-${String(activeRescueRequest.id).padStart(6, '0')}`} · Requested {new Date(activeRescueRequest.created_at).toLocaleString()}
          </p>
        </div>
        <svg className="rescue-request-icon" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <path d="M52.8 17.2c3.2-5.5 11.2-5.5 14.4 0l43.1 74.7c3.2 5.5-.8 12.4-7.2 12.4H16.9c-6.4 0-10.4-6.9-7.2-12.4l43.1-74.7Z" fill="#fff7d6" stroke="currentColor" strokeWidth="5" />
          <path d="M60 40v34" stroke="#123a59" strokeWidth="8" strokeLinecap="round" />
          <circle cx="60" cy="88" r="5" fill="#123a59" />
        </svg>
      </div>
      {rescueDecisionError ? <p className="rescue-request-error" role="alert">{rescueDecisionError}</p> : null}
      <div className="rescue-request-actions">
        <button className="rescue-request-button rescue-request-button-primary" disabled={rescueDecisionId !== null} onClick={() => void decideRescueRequest(activeRescueRequest, 'accepted')}>
          {rescueDecisionId === activeRescueRequest.id ? 'Processing…' : 'Confirm Dispatch'}
        </button>
        <button className="rescue-request-button" disabled={rescueDecisionId !== null} onClick={() => void decideRescueRequest(activeRescueRequest, 'declined')}>Dismiss Request</button>
      </div>
    </BackupModal>
  ) : null;
  const pageProps = { barangayName, onLogout, onAuthError, onOpenDashboard: () => setView('dashboard') };

  return (
    <>
      {rescuePopup || popup}
      {view === 'dashboard' ? <DashboardPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} onOpenAccount={() => setView('account')} /> : null}
      {view === 'account' ? <PersonnelAccountsPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} /> : null}
      {view === 'flood-monitoring' ? <FloodMonitoringPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} onOpenAccount={() => setView('account')} /> : null}
      {view === 'evacuation-center' ? <EvacuationCenterPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenAccount={() => setView('account')} /> : null}
      {view === 'monitoring' ? <MonitoringPage {...pageProps} focusReportId={focusReportId} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} onOpenAccount={() => setView('account')} /> : null}
    </>
  );
}
