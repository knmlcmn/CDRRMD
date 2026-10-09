import { useCallback, useEffect, useRef, useState } from 'react';
import MonitoringPage from './pages/MonitoringPage';
import PersonnelAccountsPage from './pages/PersonnelAccountsPage';
import FloodMonitoringPage from './pages/FloodMonitoringPage';
import EvacuationCenterPage from './pages/EvacuationCenterPage';
import DashboardPage from './pages/DashboardPage';
import WaterLevelAlert, { type WaterLevelNoticeKind } from './components/WaterLevelAlert';
import BackupModal from './components/BackupModal';
import RescueRequestRouteMap from './components/RescueRequestRouteMap';
import RescueImagePreview from './components/RescueImagePreview';
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
  email?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  evacuation_area_name?: string | null;
  evacuation_latitude?: number | string | null;
  evacuation_longitude?: number | string | null;
  estimated_people?: number | null;
  are_people_trapped?: boolean | null;
  notes?: string | null;
  image_base64?: string | null;
  has_image?: boolean;
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
  const [openedRescueRequestId, setOpenedRescueRequestId] = useState<number | null>(null);
  const [rescueDecisionId, setRescueDecisionId] = useState<number | null>(null);
  const [rescueDecisionError, setRescueDecisionError] = useState('');
  const [rescueRouteMetrics, setRescueRouteMetrics] = useState<{ distanceKm: number; etaMinutes: number } | null>();
  const [showRescueImage, setShowRescueImage] = useState(false);
  const [rescueProofImage, setRescueProofImage] = useState<string | null>(null);
  const [rescueProofLoading, setRescueProofLoading] = useState(false);
  const [focusReportId, setFocusReportId] = useState<number | null>(null);
  const [notices, setNotices] = useState<Array<{ id: number; alert: WaterLevelSensor; kind: WaterLevelNoticeKind }>>([]);
  const noticeIdRef = useRef(0);
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
        const next = (Array.isArray(data) ? data : []).filter((report) =>
          String(report.status || '').toLowerCase() === 'pending'
        );
        setPendingRescueRequests((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      } catch (error: unknown) {
        if ((error as { response?: { status?: number } })?.response?.status === 401) onAuthError();
      }
    };
    void checkRescueRequests();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkRescueRequests();
    }, 5_000);
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
        return;
      }
      const lastLevel = lastWarningLevelRef.current;
      if (lastLevel === null || ownSensor.waterLevelPercentage >= lastLevel + 10) {
        lastWarningLevelRef.current = ownSensor.waterLevelPercentage;
        showNotice(ownSensor, 'warning');
      }
    };
    void checkWaterLevel();
    const timer = window.setInterval(() => void checkWaterLevel(), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
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
  const popup = activeNotice ? <WaterLevelAlert key={activeNotice.id} alert={activeNotice.alert} kind={activeNotice.kind} onClose={() => setNotices((current) => current.filter((item) => item.id !== activeNotice.id))} onSeeDetails={() => { setNotices([]); setView('flood-monitoring'); }} /> : null;
  const activeRescueRequest = (
    openedRescueRequestId == null
      ? null
      : pendingRescueRequests.find((request) => request.id === openedRescueRequestId)
  ) || pendingRescueRequests.find((request) => !dismissedRescueIds.has(request.id)) || null;
  const residentName = activeRescueRequest
    ? [activeRescueRequest.first_name, activeRescueRequest.last_name].filter(Boolean).join(' ').trim() || 'Resident'
    : 'Resident';
  const residentLatitude = Number(activeRescueRequest?.latitude);
  const residentLongitude = Number(activeRescueRequest?.longitude);
  const evacuationLatitude = Number(activeRescueRequest?.evacuation_latitude);
  const evacuationLongitude = Number(activeRescueRequest?.evacuation_longitude);
  const hasRouteLocations = [residentLatitude, residentLongitude, evacuationLatitude, evacuationLongitude].every(Number.isFinite);

  useEffect(() => {
    setRescueRouteMetrics(undefined);
    setShowRescueImage(false);
    setRescueProofImage(null);
    setRescueProofLoading(false);
  }, [activeRescueRequest?.id]);

  const standbyRescueRequest = (request: RescueRequestNotice) => {
    setDismissedRescueIds((current) => new Set(current).add(request.id));
    setOpenedRescueRequestId((current) => current === request.id ? null : current);
    setRescueDecisionError('');
  };

  const reopenPendingRescueRequest = (reportId: number) => {
    setDismissedRescueIds((current) => {
      const next = new Set(current);
      next.delete(reportId);
      return next;
    });
    setOpenedRescueRequestId(reportId);
    setRescueDecisionError('');
  };

  const decideRescueRequest = async (request: RescueRequestNotice) => {
    if (rescueDecisionId !== null) return;
    setRescueDecisionId(request.id);
    setRescueDecisionError('');
    try {
      await api.patch(`/barangay/reports/${request.id}/status`, {
        status: 'accepted',
        notes: `Barangay ${barangayName} confirmed dispatch from the resident rescue notification.`,
      });
      setPendingRescueRequests((current) => current.filter((item) => item.id !== request.id));
      setDismissedRescueIds((current) => new Set(current).add(request.id));
      setOpenedRescueRequestId(null);
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

  const rescueDescription = String(activeRescueRequest?.notes || '').trim();
  const visibleRescueDescription = /^selected evacuation area:/i.test(rescueDescription) ? '' : rescueDescription;

  const openRescueProof = async (request: RescueRequestNotice) => {
    if (request.image_base64) {
      setRescueProofImage(request.image_base64);
      setShowRescueImage(true);
      return;
    }
    setRescueProofLoading(true);
    setRescueDecisionError('');
    try {
      const { data } = await api.get<{ image_base64?: string | null }>(`/barangay/reports/${request.id}/image`);
      if (data.image_base64) {
        setRescueProofImage(data.image_base64);
        setShowRescueImage(true);
      }
    } catch (error: unknown) {
      const apiError = error as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) return onAuthError();
      setRescueDecisionError(apiError.response?.data?.message || 'Unable to load the proof image.');
    } finally {
      setRescueProofLoading(false);
    }
  };

  const rescuePopup = activeRescueRequest ? (
    <BackupModal title="Urgent Rescue Request" variant="rescue-request" onClose={() => standbyRescueRequest(activeRescueRequest)}>
      <div className="rescue-request-layout">
        <div className="rescue-request-content">
          <p className="rescue-request-eyebrow">Urgent Rescue Request</p>
          <h2 className="rescue-request-title">{residentName}</h2>
          <p className="rescue-request-subtitle">{String(activeRescueRequest.incident_type || 'Emergency rescue').replace(/_/g, ' ')}</p>
          <dl className="rescue-request-details">
            <div><dt>Contact</dt><dd>{activeRescueRequest.contact_number || activeRescueRequest.email || 'Not provided'}</dd></div>
            <div><dt>People</dt><dd>{activeRescueRequest.estimated_people || 1}</dd></div>
            <div><dt>Rescue location</dt><dd>{activeRescueRequest.location}</dd></div>
            <div><dt>Assigned evacuation</dt><dd>{activeRescueRequest.evacuation_area_name || 'Automatic nearest center'}</dd></div>
            <div><dt>Shortest route</dt><dd>{rescueRouteMetrics ? `${rescueRouteMetrics.distanceKm.toFixed(2)} km · about ${rescueRouteMetrics.etaMinutes} min` : rescueRouteMetrics === null ? 'Road route unavailable' : 'Calculating…'}</dd></div>
          </dl>
          {visibleRescueDescription ? <p className="rescue-request-description">{visibleRescueDescription}</p> : null}
          {activeRescueRequest.has_image || activeRescueRequest.image_base64 ? (
            <div className="rescue-request-meta-row">
              <span>{activeRescueRequest.report_code || `RPT-${String(activeRescueRequest.id).padStart(6, '0')}`}</span>
              <button type="button" disabled={rescueProofLoading} className="rescue-request-view-image" onClick={() => void openRescueProof(activeRescueRequest)}>{rescueProofLoading ? 'Loading…' : 'View Image'}</button>
            </div>
          ) : (
            <p className="rescue-request-meta">
              {activeRescueRequest.report_code || `RPT-${String(activeRescueRequest.id).padStart(6, '0')}`} · Requested {new Date(activeRescueRequest.created_at).toLocaleString()}
            </p>
          )}
        </div>
        {hasRouteLocations ? (
          <RescueRequestRouteMap
            resident={{ latitude: residentLatitude, longitude: residentLongitude }}
            evacuationArea={{ latitude: evacuationLatitude, longitude: evacuationLongitude }}
            residentName={residentName}
            evacuationAreaName={activeRescueRequest.evacuation_area_name || 'Assigned evacuation center'}
            onRouteMetrics={setRescueRouteMetrics}
          />
        ) : <div className="rescue-request-route-unavailable">Route location unavailable</div>}
      </div>
      {rescueDecisionError ? <p className="rescue-request-error" role="alert">{rescueDecisionError}</p> : null}
      <div className="rescue-request-actions">
        <button className="rescue-request-button rescue-request-button-primary" disabled={rescueDecisionId !== null} onClick={() => void decideRescueRequest(activeRescueRequest)}>
          {rescueDecisionId === activeRescueRequest.id ? 'Processing…' : 'Confirm Dispatch'}
        </button>
        <button className="rescue-request-button" disabled={rescueDecisionId !== null} onClick={() => standbyRescueRequest(activeRescueRequest)}>Standby Request</button>
      </div>
    </BackupModal>
  ) : null;
  const pageProps = { barangayName, onLogout, onAuthError, onOpenDashboard: () => setView('dashboard') };

  return (
    <>
      {rescuePopup || popup}
      {showRescueImage && activeRescueRequest && rescueProofImage ? (
        <RescueImagePreview
          image={rescueProofImage}
          residentName={residentName}
          createdAt={activeRescueRequest.created_at}
          onClose={() => setShowRescueImage(false)}
        />
      ) : null}
      {view === 'dashboard' ? <DashboardPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} onOpenAccount={() => setView('account')} onOpenPendingRescue={reopenPendingRescueRequest} /> : null}
      {view === 'account' ? <PersonnelAccountsPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} /> : null}
      {view === 'flood-monitoring' ? <FloodMonitoringPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} onOpenAccount={() => setView('account')} /> : null}
      {view === 'evacuation-center' ? <EvacuationCenterPage {...pageProps} onOpenMonitoring={() => setView('monitoring')} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenAccount={() => setView('account')} /> : null}
      {view === 'monitoring' ? <MonitoringPage {...pageProps} focusReportId={focusReportId} onOpenFloodMonitoring={() => setView('flood-monitoring')} onOpenEvacuationCenter={() => setView('evacuation-center')} onOpenAccount={() => setView('account')} /> : null}
    </>
  );
}
