import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, setAuthToken, api } from './services/apiClient';
import LoginPage from './pages/LoginPage';
import type { StaffPortal } from './services/authService';
import WaterLevelUpdateToast, { type WaterLevelUpdateNoticeKind } from './components/WaterLevelUpdateToast';
import { loadWaterLevelSensors, WATER_LEVEL_POLL_INTERVAL_MS, type WaterLevelSensor } from './services/waterLevelSensors';
import { isCalambaCurrentlyRainy } from './services/weatherAlerts';

type View =
  | 'dashboard'
  | 'admin'
  | 'users'
  | 'barangay'
  | 'rescuers'
  | 'monitoring'
  | 'flood-monitoring'
  | 'evacuation-areas'
  | 'post-updates'
  | 'history';

const BarangayPortal = lazy(() => import('./barangay/BarangayPortal'));
const BackupNotifications = lazy(() => import('./components/BackupNotifications'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const EvacuationAreasPage = lazy(() => import('./pages/EvacuationAreasPage'));
const FloodMonitoringPage = lazy(() => import('./pages/FloodMonitoringPage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const PostUpdatesPage = lazy(() => import('./pages/PostUpdatesPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const BarangayAccountsPage = lazy(() => import('./pages/BarangayAccountsPage'));
const RescuerAccountsPage = lazy(() => import('./pages/RescuerAccountsPage'));

type WaterUpdateNotice = {
  id: number;
  kind: WaterLevelUpdateNoticeKind;
  sensors: WaterLevelSensor[];
};

function roleFromToken(token: string | null): StaffPortal | null {
  try {
    if (!token) return null;
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const role = JSON.parse(atob(payload)).role;
    return role === 'admin' || role === 'barangay' ? role : null;
  } catch {
    return null;
  }
}

function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token'),
  );
  const [role, setRole] = useState<StaffPortal | null>(() => roleFromToken(
    localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token'),
  ));
  const [view, setView] = useState<View>('dashboard');
  const [backupReportId, setBackupReportId] = useState<number | null>(null);
  const [backupNoticeReportId, setBackupNoticeReportId] = useState<number | null>(null);
  const [waterUpdateNotices, setWaterUpdateNotices] = useState<WaterUpdateNotice[]>([]);
  const waterNoticeIdRef = useRef(0);
  const lastNotifiedWaterBucketRef = useRef<Record<string, number>>({});

  const finishWaterUpdateNotice = useCallback((finished: WaterUpdateNotice) => {
    setWaterUpdateNotices((current) => current.filter((notice) => notice.id !== finished.id));
    if (finished.kind !== 'update') return;

    void isCalambaCurrentlyRainy().then((isRainy) => {
      if (!isRainy) return;
      setWaterUpdateNotices((current) => [...current, {
        id: ++waterNoticeIdRef.current,
        kind: 'post-updates',
        sensors: finished.sensors,
      }]);
    });
  }, []);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!token || role !== 'admin') {
      return undefined;
    }

    let stopped = false;
    const checkForWaterUpdates = async () => {
      const sensors = await loadWaterLevelSensors();
      if (stopped) return;

      const availableSensorIds = new Set(
        sensors.filter((sensor) => sensor.status === 'Active').map((sensor) => sensor.id),
      );
      setWaterUpdateNotices((current) => current
        .map((notice) => ({
          ...notice,
          sensors: notice.sensors.filter((sensor) => availableSensorIds.has(sensor.id)),
        }))
        .filter((notice) => notice.sensors.length > 0));

      const updatedSensors: WaterLevelSensor[] = [];
      sensors.forEach((sensor) => {
        if (sensor.status === 'Unavailable' || !sensor.hasReading || sensor.waterLevelPercentage < 40) {
          delete lastNotifiedWaterBucketRef.current[sensor.id];
          return;
        }

        const currentBucket = Math.floor(sensor.waterLevelPercentage / 10) * 10;
        const lastBucket = lastNotifiedWaterBucketRef.current[sensor.id];
        if (!Number.isFinite(lastBucket) || currentBucket >= lastBucket + 10) {
          updatedSensors.push(sensor);
          lastNotifiedWaterBucketRef.current[sensor.id] = currentBucket;
        }
      });

      if (updatedSensors.length > 0) {
        setWaterUpdateNotices((current) => [...current, {
          id: ++waterNoticeIdRef.current,
          kind: 'update',
          sensors: updatedSensors,
        }]);
      }
    };

    checkForWaterUpdates().catch(() => {});
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') checkForWaterUpdates().catch(() => {});
    }, WATER_LEVEL_POLL_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') checkForWaterUpdates().catch(() => {});
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [token, role]);

  useEffect(() => {
    function handleUnload() {
      const storedToken =
        localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
      if (!storedToken) return;
      const apiBase = API_BASE_URL.replace(/\/$/, '');
      const blob = new Blob(
        [JSON.stringify({ token: storedToken })],
        { type: 'application/json' },
      );
      navigator.sendBeacon(`${apiBase}/auth/logout`, blob);
    }
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  function onLoggedIn(nextToken: string, rememberMe: boolean, nextRole: StaffPortal) {
    if (rememberMe) {
      localStorage.setItem('admin_token', nextToken);
      sessionStorage.removeItem('admin_token');
    } else {
      sessionStorage.setItem('admin_token', nextToken);
      localStorage.removeItem('admin_token');
    }
    setAuthToken(nextToken);
    setToken(nextToken);
    setRole(nextRole);
  }

  function onLogout() {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_token');
    setWaterUpdateNotices([]);
    setBackupReportId(null);
    lastNotifiedWaterBucketRef.current = {};
    setToken(null);
    setRole(null);
    setView('dashboard');
  }

  function openView(nextView: View) {
    setView(nextView);
  }

  if (!token || !role) {
    return <LoginPage onLoggedIn={onLoggedIn} />;
  }

  if (role === 'barangay') {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { barangayName?: string };
    return <Suspense fallback={<p className="p-6 text-sm text-slate-600">Loading Barangay Portal...</p>}><BarangayPortal token={token} barangayName={payload.barangayName || 'Unknown'} onLogout={onLogout} onAuthError={onLogout} /></Suspense>;
  }

  const shellProps = {
    onLogout,
    onOpenDashboard: () => openView('dashboard'),
    onOpenAdmin: () => openView('admin'),
    onOpenUsers: () => openView('users'),
    onOpenBarangay: () => openView('barangay'),
    onOpenRescuers: () => openView('rescuers'),
    onOpenMonitoring: () => openView('monitoring'),
    onOpenFloodMonitoring: () => openView('flood-monitoring'),
    onOpenEvacuationAreas: () => openView('evacuation-areas'),
    onOpenPostUpdates: () => openView('post-updates'),
    onOpenHistory: () => openView('history'),
    onOpenBackupRequest: setBackupNoticeReportId,
    onAuthError: onLogout,
  };

  let currentPage = <DashboardPage {...shellProps} />;
  if (view === 'evacuation-areas') currentPage = <EvacuationAreasPage {...shellProps} />;
  if (view === 'admin') currentPage = <AdminPage {...shellProps} />;
  if (view === 'users') currentPage = <UsersPage {...shellProps} />;
  if (view === 'barangay') currentPage = <BarangayAccountsPage {...shellProps} />;
  if (view === 'rescuers') currentPage = <RescuerAccountsPage {...shellProps} />;
  if (view === 'monitoring') currentPage = <MonitoringPage key={backupReportId ?? 'monitoring'} {...shellProps} backupReportId={backupReportId} />;
  if (view === 'flood-monitoring') currentPage = <FloodMonitoringPage {...shellProps} />;
  if (view === 'post-updates') currentPage = <PostUpdatesPage {...shellProps} />;
  if (view === 'history') currentPage = <HistoryPage {...shellProps} />;

  const activeWaterUpdateNotice = waterUpdateNotices[0];
  return (
    <>
      {activeWaterUpdateNotice ? (
        <WaterLevelUpdateToast
          key={activeWaterUpdateNotice.id}
          sensors={activeWaterUpdateNotice.sensors}
          kind={activeWaterUpdateNotice.kind}
          onDone={() => finishWaterUpdateNotice(activeWaterUpdateNotice)}
          onSeeDetails={() => {
            finishWaterUpdateNotice(activeWaterUpdateNotice);
            openView(activeWaterUpdateNotice.kind === 'post-updates' ? 'post-updates' : 'flood-monitoring');
          }}
        />
      ) : null}
      <Suspense fallback={<p className="p-6 text-sm text-slate-600">Loading portal...</p>}>
        {currentPage}
        <BackupNotifications
          reopenReportId={backupNoticeReportId}
          onStandby={() => setBackupNoticeReportId(null)}
          onConfirm={(reportId) => {
            setBackupNoticeReportId(null);
            setBackupReportId(reportId);
            openView('monitoring');
          }}
        />
      </Suspense>
    </>
  );
}

export default App;
