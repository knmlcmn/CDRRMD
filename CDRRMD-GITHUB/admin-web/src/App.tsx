import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, setAuthToken, api } from './services/apiClient';
import BackupNotifications from './components/BackupNotifications';
import DashboardPage from './pages/DashboardPage';
import EvacuationAreasPage from './pages/EvacuationAreasPage';
import LoginPage from './pages/LoginPage';
import FloodMonitoringPage from './pages/FloodMonitoringPage';
import MonitoringPage from './pages/MonitoringPage';
import AdminPage from './pages/AdminPage';
import UsersPage from './pages/UsersPage';
import PostUpdatesPage from './pages/PostUpdatesPage';
import BarangayAccountsPage from './pages/BarangayAccountsPage';
import RescuerAccountsPage from './pages/RescuerAccountsPage';
import RescuerDashboardPage from './pages/RescuerDashboardPage';
import RescuerFloodMonitoringPage from './pages/RescuerFloodMonitoringPage';
import RescuerAccountPage from './pages/RescuerAccountPage';
import type { StaffPortal } from './services/authService';
import WaterLevelUpdateToast, { type WaterLevelUpdateNoticeKind } from './components/WaterLevelUpdateToast';
import { loadWaterLevelSensors, type WaterLevelSensor } from './services/waterLevelSensors';

type View =
  | 'dashboard'
  | 'admin'
  | 'users'
  | 'barangay'
  | 'rescuers'
  | 'monitoring'
  | 'flood-monitoring'
  | 'evacuation-areas'
  | 'post-updates';

type RescuerView = 'incidents' | 'flood-monitoring' | 'account';

const BarangayPortal = lazy(() => import('./barangay/BarangayPortal'));

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
    return role === 'admin' || role === 'barangay' || role === 'rescuer' || role === 'barangay_rescuer' ? role : null;
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
  const [rescuerView, setRescuerView] = useState<RescuerView>('incidents');
  const [backupReportId, setBackupReportId] = useState<number | null>(null);
  const [waterUpdateNotices, setWaterUpdateNotices] = useState<WaterUpdateNotice[]>([]);
  const waterNoticeIdRef = useRef(0);
  const lastNotifiedWaterBucketRef = useRef<Record<string, number>>({});

  const finishWaterUpdateNotice = useCallback(() => {
    setWaterUpdateNotices((current) => {
      const [finished, ...remaining] = current;
      if (!finished) return current;
      if (finished.kind === 'update') {
        return [{
          id: ++waterNoticeIdRef.current,
          kind: 'post-updates',
          sensors: finished.sensors,
        }, ...remaining];
      }
      return remaining;
    });
  }, []);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!token || role !== 'admin' || view === 'dashboard') {
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
    const timer = window.setInterval(() => checkForWaterUpdates().catch(() => {}), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [token, role, view]);

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
    setRescuerView('incidents');
  }

  function openView(nextView: View) {
    if (nextView === 'dashboard') setWaterUpdateNotices([]);
    setView(nextView);
  }

  if (!token) {
    return <LoginPage onLoggedIn={onLoggedIn} />;
  }

  if (role === 'rescuer' || role === 'barangay_rescuer') {
    const rescuerProps = {
      responderRole: role,
      onLogout,
      onAuthError: onLogout,
      onOpenIncidents: () => setRescuerView('incidents'),
      onOpenFloodMonitoring: () => setRescuerView('flood-monitoring'),
      onOpenAccount: () => setRescuerView('account'),
    };
    if (rescuerView === 'flood-monitoring') return <RescuerFloodMonitoringPage {...rescuerProps} />;
    if (rescuerView === 'account') return <RescuerAccountPage {...rescuerProps} />;
    return <RescuerDashboardPage {...rescuerProps} />;
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

  const activeWaterUpdateNotice = waterUpdateNotices[0];
  return (
    <>
      {view !== 'dashboard' && activeWaterUpdateNotice ? (
        <WaterLevelUpdateToast
          key={activeWaterUpdateNotice.id}
          sensors={activeWaterUpdateNotice.sensors}
          kind={activeWaterUpdateNotice.kind}
          onDone={finishWaterUpdateNotice}
        />
      ) : null}
      {currentPage}
      <BackupNotifications onConfirm={(reportId) => {
        setBackupReportId(reportId);
        openView('monitoring');
      }} />
    </>
  );
}

export default App;
