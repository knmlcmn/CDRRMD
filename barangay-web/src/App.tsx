import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, setAuthToken, api } from './services/apiClient';
import LoginPage from './pages/LoginPage';
import MonitoringPage from './pages/MonitoringPage';
import AccountPage from './pages/AccountPage';
import FloodMonitoringPage from './pages/FloodMonitoringPage';
import WaterLevelAlert, { type WaterLevelNoticeKind } from './components/WaterLevelAlert';
import { loadWaterLevelSensors, type WaterLevelSensor } from './services/waterLevelSensors';

type View = 'monitoring' | 'flood-monitoring' | 'account';

type Session = {
  token: string;
  refreshToken: string;
  barangayName: string;
};

function decodeBarangayName(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.barangayName || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem('brgy_session') || sessionStorage.getItem('brgy_session');
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function saveSession(session: Session, remember: boolean) {
  const raw = JSON.stringify(session);
  if (remember) {
    localStorage.setItem('brgy_session', raw);
    sessionStorage.removeItem('brgy_session');
  } else {
    sessionStorage.setItem('brgy_session', raw);
    localStorage.removeItem('brgy_session');
  }
}

function clearSession() {
  localStorage.removeItem('brgy_session');
  sessionStorage.removeItem('brgy_session');
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<View>('monitoring');
  const [waterLevelNotices, setWaterLevelNotices] = useState<Array<{
    id: number;
    alert: WaterLevelSensor;
    kind: WaterLevelNoticeKind;
  }>>([]);
  const noticeIdRef = useRef(0);
  const reminderTimerRef = useRef<number | null>(null);
  const lastWarningLevelRef = useRef<number | null>(null);

  const showWaterLevelNotice = useCallback((alert: WaterLevelSensor, kind: WaterLevelNoticeKind) => {
    const id = ++noticeIdRef.current;
    setWaterLevelNotices([{ id, alert, kind }]);
  }, []);

  const dismissWaterLevelNotice = useCallback((id: number) => {
    setWaterLevelNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  useEffect(() => {
    if (session?.token) {
      setAuthToken(session.token);
    } else {
      setAuthToken(null);
    }
  }, [session]);

  // A short heartbeat makes presence reflect an actually open Barangay Portal.
  // If the tab/browser closes unexpectedly, the admin view marks it offline
  // automatically after the server-side presence window expires.
  useEffect(() => {
    if (!session?.token) return undefined;
    let stopped = false;
    const sendHeartbeat = () => {
      if (stopped) return;
      api.post('/barangay/presence/heartbeat').catch(() => {});
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 15_000);
    document.addEventListener('visibilitychange', sendHeartbeat);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sendHeartbeat);
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token || !session.barangayName) return undefined;
    let stopped = false;
    const normalizedBarangay = session.barangayName.trim().toLowerCase();

    const checkWaterLevel = async () => {
      const sensors = await loadWaterLevelSensors();
      if (stopped) return;
      const ownSensor = sensors.find((sensor) => sensor.barangayName.toLowerCase() === normalizedBarangay);
      const isWarningLevel = Boolean(
        ownSensor?.status === 'Active'
        && ownSensor.hasReading
        && ownSensor.waterLevelPercentage >= 40,
      );

      if (!ownSensor || !isWarningLevel) {
        lastWarningLevelRef.current = null;
        setWaterLevelNotices([]);
        if (reminderTimerRef.current !== null) {
          window.clearTimeout(reminderTimerRef.current);
          reminderTimerRef.current = null;
        }
        return;
      }

      const lastWarningLevel = lastWarningLevelRef.current;
      const shouldShowWarning = lastWarningLevel === null
        || ownSensor.waterLevelPercentage >= lastWarningLevel + 10;
      if (shouldShowWarning) {
        lastWarningLevelRef.current = ownSensor.waterLevelPercentage;
        showWaterLevelNotice(ownSensor, 'warning');
        if (reminderTimerRef.current !== null) window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = window.setTimeout(() => {
          loadWaterLevelSensors().then((currentSensors) => {
            const currentOwnSensor = currentSensors.find(
              (sensor) => sensor.barangayName.toLowerCase() === normalizedBarangay,
            );
            if (
              !stopped
              && currentOwnSensor?.status === 'Active'
              && currentOwnSensor.hasReading
              && currentOwnSensor.waterLevelPercentage >= 40
            ) {
              showWaterLevelNotice(currentOwnSensor, 'reminder');
            }
          }).catch(() => {});
        }, 8_500);
      }
    };

    checkWaterLevel().catch(() => {});
    const timer = window.setInterval(() => checkWaterLevel().catch(() => {}), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (reminderTimerRef.current !== null) window.clearTimeout(reminderTimerRef.current);
    };
  }, [session?.barangayName, session?.token, showWaterLevelNotice]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const markOffline = () => {
      const apiBase = API_BASE.replace(/\/$/, '');
      const blob = new Blob([JSON.stringify({ token: session.token })], { type: 'application/json' });
      navigator.sendBeacon(`${apiBase}/barangay/presence/offline`, blob);
    };
    window.addEventListener('pagehide', markOffline);
    return () => window.removeEventListener('pagehide', markOffline);
  }, [session?.token]);

  function onLoggedIn(token: string, refreshToken: string, rememberMe: boolean) {
    const barangayName = decodeBarangayName(token);
    const s: Session = { token, refreshToken, barangayName };
    saveSession(s, rememberMe);
    setAuthToken(token);
    setSession(s);
    setView('monitoring');
  }

  function onLogout() {
    api.post('/auth/logout').catch(() => {});
    clearSession();
    setAuthToken(null);
    setSession(null);
    setView('monitoring');
  }

  function onAuthError() {
    clearSession();
    setAuthToken(null);
    setSession(null);
  }

  if (!session) {
    return <LoginPage onLoggedIn={onLoggedIn} />;
  }

  const barangayName = session.barangayName;

  const activeWaterLevelNotice = waterLevelNotices[0];
  const waterAlertPopup = activeWaterLevelNotice ? (
    <WaterLevelAlert
      key={activeWaterLevelNotice.id}
      alert={activeWaterLevelNotice.alert}
      kind={activeWaterLevelNotice.kind}
      onClose={() => dismissWaterLevelNotice(activeWaterLevelNotice.id)}
    />
  ) : null;

  if (view === 'account') {
    return (
      <>
        {waterAlertPopup}
        <AccountPage
          barangayName={barangayName}
          onLogout={onLogout}
          onOpenMonitoring={() => setView('monitoring')}
          onOpenFloodMonitoring={() => setView('flood-monitoring')}
          onAuthError={onAuthError}
        />
      </>
    );
  }

  if (view === 'flood-monitoring') {
    return (
      <>
        {waterAlertPopup}
        <FloodMonitoringPage
          barangayName={barangayName}
          onLogout={onLogout}
          onOpenMonitoring={() => setView('monitoring')}
          onOpenAccount={() => setView('account')}
          onAuthError={onAuthError}
        />
      </>
    );
  }

  return (
    <>
      {waterAlertPopup}
      <MonitoringPage
        barangayName={barangayName}
        onLogout={onLogout}
        onOpenFloodMonitoring={() => setView('flood-monitoring')}
        onOpenAccount={() => setView('account')}
        onAuthError={onAuthError}
      />
    </>
  );
}
