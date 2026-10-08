import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import { fetchRoadRoute } from '../services/roadRouting';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type {
  DashboardIncident,
  DashboardSummary,
  EvacuationAreaItem,
  MonitoringReport,
  RescuerAccount,
} from '../types';
import { buildCalambaMapHtml } from '../utils/calambaMapHtml';
import { loadWaterLevelSensors, type WaterLevelSensor } from '../services/waterLevelSensors';
import WaterLevelAlert, { type WaterLevelNoticeKind } from '../components/WaterLevelAlert';
import { formatIncidentStatus } from '../utils/incidentStatus';

type RainRankingItem = {
  barangayName: string;
  rainIntensityMmPerHour: number;
  rainLevel: 'Light' | 'Moderate' | 'Heavy' | 'Severe';
};
type Coordinate = { latitude: number; longitude: number };
type CityRescuerLocation = RescuerAccount & { kind: 'barangay' | 'cddrmd' };

type Props = {
  onLogout: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenPostUpdates: () => void;
  onAuthError: () => void;
};

const ACTIVE_INCIDENT_STATUSES = new Set(['pending', 'accepted', 'in_progress']);

function titleCase(value: string) {
  if (!value) {
    return '-';
  }
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function waterLevelRowColor(sensor: WaterLevelSensor) {
  if (sensor.status === 'Unavailable') return 'bg-slate-200 text-slate-500';
  if (!sensor.hasReading) return 'bg-slate-100';
  if (sensor.waterLevelPercentage < 25) return 'bg-emerald-100 hover:bg-emerald-200';
  if (sensor.waterLevelPercentage < 50) return 'bg-yellow-100 hover:bg-yellow-200';
  if (sensor.waterLevelPercentage < 75) return 'bg-orange-100 hover:bg-orange-200';
  return 'bg-red-100 hover:bg-red-200';
}

function buildMapHtml(
  areas: EvacuationAreaItem[],
  barangayBoundaryGeoJsonUrl: string,
  rainImpactUrl: string,
  windDataUrl: string,
  showForecastTimeline: boolean,
) {
  return buildCalambaMapHtml(
    areas,
    null,
    [],
    null,
    null,
    [],
    barangayBoundaryGeoJsonUrl,
    '',
    rainImpactUrl,
    windDataUrl,
    {
      boundary: true,
      floodHazard: false,
      evacuationAreas: true,
      incidentMarkers: true,
      responderRoute: true,
      weatherOverlay: true,
      temperatureOverlay: false,
      humidityOverlay: false,
      windOverlay: false,
    },
    'Assigned responder location',
    { focusOnIncident: true, allowLiveRouteUpdates: true, responderKind: 'generic', showForecastTimeline },
  );
}

export default function DashboardPage({ onLogout, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenRescuers, onOpenEvacuationAreas, onOpenMonitoring, onOpenFloodMonitoring, onOpenPostUpdates, onAuthError }: Props) {
  const [areas, setAreas] = useState<EvacuationAreaItem[]>([]);
  const [incidents, setIncidents] = useState<DashboardIncident[]>([]);
  const [operationalReports, setOperationalReports] = useState<MonitoringReport[]>([]);
  const [cityRescuers, setCityRescuers] = useState<CityRescuerLocation[]>([]);
  const [mapFocusedReportId, setMapFocusedReportId] = useState<number | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [waterLevelSensors, setWaterLevelSensors] = useState<WaterLevelSensor[]>([]);
  const [waterLevelAlerts, setWaterLevelAlerts] = useState<WaterLevelSensor[]>([]);
  const [showWaterLevelAlert, setShowWaterLevelAlert] = useState(false);
  const [waterLevelNoticeKind, setWaterLevelNoticeKind] = useState<WaterLevelNoticeKind>('warning');
  const notifiedWaterLevelsRef = useRef<Record<string, number>>({});
  const postUpdateTimerRef = useRef<number | null>(null);
  const [cards, setCards] = useState<DashboardSummary['cards']>({
    emergencyAlerts: 0,
    activeTeams: 0,
    evacuationAreas: 0,
    totalEvacuees: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topRainBarangays, setTopRainBarangays] = useState<RainRankingItem[]>([]);
  const [rainLegendUpdatedAt, setRainLegendUpdatedAt] = useState<string | null>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);

  const mapFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastFocusedRescue = useRef('');
  const [mapReady, setMapReady] = useState(false);

  const loadFeed = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const [areasResponse, summaryResponse, reportsResponse, cdrrmdResponse, barangayResponderResponse] = await Promise.all([
        api.get('/content/evacuation-areas'),
        api.get('/content/dashboard-summary'),
        api.get('/reports'),
        api.get('/rescuers/accounts', { params: { role: 'rescuer' } }),
        api.get('/rescuers/accounts', { params: { role: 'barangay_rescuer' } }),
      ]);

      setAreas(areasResponse.data);
      setCards(summaryResponse.data.cards);
      setIncidents(summaryResponse.data.incidents);
      setOperationalReports(Array.isArray(reportsResponse.data) ? reportsResponse.data : []);
      setCityRescuers([
        ...(Array.isArray(cdrrmdResponse.data) ? cdrrmdResponse.data : []).map((rescuer: RescuerAccount) => ({ ...rescuer, kind: 'cddrmd' as const })),
        ...(Array.isArray(barangayResponderResponse.data) ? barangayResponderResponse.data : []).map((rescuer: RescuerAccount) => ({ ...rescuer, kind: 'barangay' as const })),
      ]);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load dashboard data.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [onAuthError]);

  async function loadRainRanking() {
    try {
      const rainImpactResponse = await api.get('/flood-risk/calamba/rain-impact').catch(() => ({ data: null }));
      const rainPayload = rainImpactResponse?.data as {
        updatedAt?: string;
        barangayImpacts?: Array<{
          barangayName?: string;
          rainIntensityMmPerHour?: number;
          rainLevel?: string;
        }>;
      } | null;

      const impacts = Array.isArray(rainPayload?.barangayImpacts) ? rainPayload.barangayImpacts : [];

      const ranked = impacts
        .map((item) => {
          const rain = Number(item?.rainIntensityMmPerHour || 0);
          const normalizedLevel = String(item?.rainLevel || 'Light');
          const level = (normalizedLevel === 'Severe' || normalizedLevel === 'Heavy' || normalizedLevel === 'Moderate')
            ? normalizedLevel
            : 'Light';

          return {
            barangayName: String(item?.barangayName || 'Barangay'),
            rainIntensityMmPerHour: Number.isFinite(rain) ? rain : 0,
            rainLevel: level as RainRankingItem['rainLevel'],
          };
        })
        .filter((item) => item.rainIntensityMmPerHour > 2.5) // Moderate and above only (>2.5 mm/hr)
        .sort((a, b) => b.rainIntensityMmPerHour - a.rainIntensityMmPerHour);

      setTopRainBarangays(ranked);
      setRainLegendUpdatedAt(rainPayload?.updatedAt || new Date().toISOString());
    } catch {
      // Keep existing ranking if rain feed is temporarily unavailable.
    }
  }

  async function loadWaterLevels() {
    setWaterLevelSensors(await loadWaterLevelSensors());
  }

  async function checkWaterLevelAlerts() {
    const sensors = await loadWaterLevelSensors();
    setWaterLevelSensors(sensors);
    const availableSensorIds = new Set(
      sensors.filter((sensor) => sensor.status === 'Active').map((sensor) => sensor.id),
    );
    setWaterLevelAlerts((currentAlerts) => currentAlerts.filter((sensor) => availableSensorIds.has(sensor.id)));
    const notifiedLevels = notifiedWaterLevelsRef.current;

    const nextAlerts: WaterLevelSensor[] = [];
    sensors.forEach((sensor) => {
      if (sensor.status === 'Unavailable' || !sensor.hasReading || sensor.waterLevelPercentage < 40) {
        delete notifiedLevels[sensor.id];
        return;
      }

      const lastNotifiedPercentage = notifiedLevels[sensor.id];
      if (!Number.isFinite(lastNotifiedPercentage) || sensor.waterLevelPercentage >= lastNotifiedPercentage + 10) {
        nextAlerts.push(sensor);
        notifiedLevels[sensor.id] = sensor.waterLevelPercentage;
      }

    });

    notifiedWaterLevelsRef.current = { ...notifiedLevels };

    if (nextAlerts.length > 0) {
      setWaterLevelAlerts(nextAlerts);
      setWaterLevelNoticeKind('warning');
      setShowWaterLevelAlert(true);
      if (postUpdateTimerRef.current !== null) window.clearTimeout(postUpdateTimerRef.current);
      postUpdateTimerRef.current = window.setTimeout(() => {
        loadWaterLevelSensors().then((currentSensors) => {
          const currentAvailableIds = new Set(
            currentSensors
              .filter((sensor) => sensor.status === 'Active' && sensor.hasReading && sensor.waterLevelPercentage >= 40)
              .map((sensor) => sensor.id),
          );
          const reminderAlerts = nextAlerts.filter((sensor) => currentAvailableIds.has(sensor.id));
          if (reminderAlerts.length > 0) {
            setWaterLevelAlerts(reminderAlerts);
            setWaterLevelNoticeKind('reminder');
            setShowWaterLevelAlert(true);
          }
        }).catch(() => {});
      }, 8_500);
    }
  }

  useEffect(() => {
    loadFeed(true);
    loadRainRanking().catch(() => {});
    checkWaterLevelAlerts().catch(() => {});

    const refreshTimer = setInterval(() => {
      loadFeed(false);
    }, 7000);

    const rainTimer = setInterval(() => {
      loadRainRanking().catch(() => {});
    }, 10000);

    const waterLevelTimer = setInterval(() => {
      checkWaterLevelAlerts().catch(() => {});
    }, 10000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadFeed(false);
        loadRainRanking().catch(() => {});
        loadWaterLevels().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(rainTimer);
      clearInterval(waterLevelTimer);
      if (postUpdateTimerRef.current !== null) window.clearTimeout(postUpdateTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadFeed]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsMapFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function enterMapFullscreen() {
    const el = mapWrapRef.current;
    if (el && el.requestFullscreen) {
      el.requestFullscreen().then(() => setIsMapFullscreen(true)).catch(() => {});
    }
  }

  function exitMapFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsMapFullscreen(false)).catch(() => {});
    }
  }

  const activeMissionReports = useMemo(() => operationalReports
    .filter((report) => ACTIVE_INCIDENT_STATUSES.has(String(report.status || '').toLowerCase()) && Boolean(report.assigned_rescuer_id)), [operationalReports]);

  const selectedMapReport = useMemo(() => activeMissionReports
    .find((report) => report.id === mapFocusedReportId) || null, [activeMissionReports, mapFocusedReportId]);

  const responderLocation = useMemo<Coordinate | null>(() => {
    const latitude = Number(selectedMapReport?.rescuer_latitude);
    const longitude = Number(selectedMapReport?.rescuer_longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selectedMapReport?.rescuer_latitude, selectedMapReport?.rescuer_longitude]);

  const residentLocation = useMemo<Coordinate | null>(() => {
    const latitude = Number(selectedMapReport?.latitude);
    const longitude = Number(selectedMapReport?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selectedMapReport?.latitude, selectedMapReport?.longitude]);

  const routeDestination = useMemo<Coordinate | null>(() => {
    if (!selectedMapReport) return null;
    if (selectedMapReport.picked_up_at) {
      const latitude = Number(selectedMapReport.evacuation_latitude);
      const longitude = Number(selectedMapReport.evacuation_longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    }
    return residentLocation;
  }, [residentLocation, selectedMapReport]);

  useEffect(() => {
    let cancelled = false;
    if (!responderLocation || !routeDestination) {
      setRouteCoordinates([]);
      return undefined;
    }
    fetchRoadRoute(responderLocation, routeDestination)
      .then((route) => { if (!cancelled) setRouteCoordinates(route.coordinates); })
      .catch(() => { if (!cancelled) setRouteCoordinates([responderLocation, routeDestination]); });
    return () => { cancelled = true; };
  }, [responderLocation, routeDestination]);

  const responderPoints = useMemo(() => cityRescuers
    .map((rescuer) => {
      const activeAssignment = activeMissionReports.find((report) => Number(report.assigned_rescuer_id) === Number(rescuer.id));
      return {
        id: rescuer.id,
        rescuerId: rescuer.rescuer_id || null,
        name: [rescuer.first_name, rescuer.last_name].filter(Boolean).join(' ') || rescuer.rescuer_id || 'Rescuer',
        latitude: rescuer.current_latitude == null ? Number.NaN : Number(rescuer.current_latitude),
        longitude: rescuer.current_longitude == null ? Number.NaN : Number(rescuer.current_longitude),
        isAvailable: !activeAssignment && rescuer.is_available !== false,
        activeReportId: activeAssignment?.id || null,
        activeReportCode: activeAssignment?.report_code || null,
        barangayName: rescuer.barangay_name || null,
        kind: rescuer.kind,
      };
    })
    .filter((rescuer) => Number.isFinite(rescuer.latitude) && Number.isFinite(rescuer.longitude)), [activeMissionReports, cityRescuers]);

  const mapHtml = useMemo(
    () => buildMapHtml(
      areas,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/barangays`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/weather/wind-field`,
      isMapFullscreen,
    ),
    [areas, isMapFullscreen],
  );

  useEffect(() => {
    function handleMapMessage(event: MessageEvent) {
      if (event.source !== mapFrameRef.current?.contentWindow || event.data?.type !== 'select-rescuer-assignment') return;
      const reportId = Number(event.data.reportId);
      if (!Number.isFinite(reportId) || !activeMissionReports.some((report) => report.id === reportId)) return;
      setRouteCoordinates([]);
      setMapFocusedReportId(reportId);
    }
    window.addEventListener('message', handleMapMessage);
    return () => window.removeEventListener('message', handleMapMessage);
  }, [activeMissionReports]);

  useEffect(() => {
    if (mapFocusedReportId && !activeMissionReports.some((report) => report.id === mapFocusedReportId)) {
      setMapFocusedReportId(null);
    }
  }, [activeMissionReports, mapFocusedReportId]);

  const postMapUpdate = useCallback((recenter = false) => {
    if (!mapReady) return;
    const responderKind = selectedMapReport?.dispatch_type === 'cddrmd_backup' ? 'cddrmd' : 'barangay';
    mapFrameRef.current?.contentWindow?.postMessage({
      type: 'rescue-map-update',
      responderLocation,
      routeCoordinates,
      incidentLocation: selectedMapReport?.picked_up_at ? null : residentLocation,
      selectedReportCode: selectedMapReport?.report_code || null,
      incidentPoints: [], responderPoints,
      selectedResponderId: selectedMapReport?.assigned_rescuer_id || null,
      responderKind,
      pickedUp: Boolean(selectedMapReport?.picked_up_at),
      recenter: Boolean(selectedMapReport) && recenter,
    }, '*');
  }, [mapReady, residentLocation, responderLocation, responderPoints, routeCoordinates, selectedMapReport]);

  const focusKey = selectedMapReport
    ? `${selectedMapReport.id}:${selectedMapReport.assigned_rescuer_id}:${Boolean(selectedMapReport.picked_up_at)}`
    : '';
  useEffect(() => {
    if (!mapReady) return;
    const shouldRecenter = Boolean(focusKey) && lastFocusedRescue.current !== focusKey;
    postMapUpdate(shouldRecenter);
    if (shouldRecenter) lastFocusedRescue.current = focusKey;
    if (!focusKey) lastFocusedRescue.current = '';
  }, [focusKey, mapReady, postMapUpdate]);

  const statusRows = useMemo(
    () =>
      areas.map((area) => ({
        ...area,
        occupancyLabel: `${area.evacuees}/${area.capacity}`,
        occupancyStatus:
          area.evacuation_status === 'full'
            ? 'Full'
            : area.evacuation_status === 'nearly_full'
              ? 'Nearly Full'
              : 'Available',
      })),
    [areas],
  );

  const cardsToRender = [
    {
      key: 'emergencyAlerts',
      label: 'Emergency Alerts',
      value: cards.emergencyAlerts,
      className: d.dashboard.cardEmergency,
      borderClass: 'border-rose-400',
      toneClass: 'text-rose-600',
    },
    {
      key: 'activeTeams',
      label: 'Active Teams',
      value: cards.activeTeams,
      className: d.dashboard.cardTeams,
      borderClass: 'border-sky-400',
      toneClass: 'text-sky-600',
    },
    {
      key: 'evacuationAreas',
      label: 'Evacuation Areas',
      value: cards.evacuationAreas,
      className: d.dashboard.cardEvac,
      borderClass: 'border-amber-400',
      toneClass: 'text-amber-600',
    },
    {
      key: 'totalEvacuees',
      label: 'Total Evacuees',
      value: cards.totalEvacuees,
      className: d.dashboard.cardEvacuees,
      borderClass: 'border-emerald-400',
      toneClass: 'text-emerald-600',
    },
  ];

  return (
    <AdminShell
      activeView="dashboard"
      title="Operations Dashboard"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={() => {}}
      onOpenAdmin={onOpenAdmin}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
        onOpenRescuers={onOpenRescuers}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={onOpenPostUpdates}
      actions={
        <>
          <button onClick={onOpenMonitoring} className={d.dashboard.topActions}>Open Monitoring</button>
          <button onClick={onOpenPostUpdates} className={d.dashboard.topActions}>Post Updates</button>
          <button onClick={onOpenEvacuationAreas} className={d.dashboard.topPrimary}>Manage Evacuation Areas</button>
        </>
      }
    >
      {showWaterLevelAlert ? <WaterLevelAlert alerts={waterLevelAlerts} kind={waterLevelNoticeKind} onClose={() => setShowWaterLevelAlert(false)} /> : null}
      <div className={d.dashboard.root}>
          {error ? <div className={d.page.error}>{error}</div> : null}

          <section className={d.dashboard.metricsGrid}>
            {cardsToRender.map((card) => (
              <article key={card.key} className={`rounded-xl border border-slate-200 border-t-4 ${card.borderClass} bg-white px-3 py-2 shadow-sm`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={`mt-0.5 text-2xl font-black ${card.toneClass}`}>{card.value}</p>
              </article>
            ))}
          </section>

          <section className={d.dashboard.overviewGrid}>
            <article className={d.dashboard.reportsPanel}>
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
                <div><h2 className={d.dashboard.reportsTitle}>Incident Reports Overview</h2><p className="text-xs text-slate-500">Latest emergency reports across Calamba City</p></div>
                <button onClick={onOpenMonitoring} className="rounded-lg bg-[#1f567d] px-3 py-2 text-xs font-bold text-white hover:bg-[#174866]">View all</button>
              </div>
              <div className={d.dashboard.reportsContentGrid}>
                <table className={d.dashboard.reportsTable}>
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Location</th>
                      <th className={d.dashboard.thHiddenMd}>Requested By</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((row) => (
                      <tr key={row.caseId}>
                        <td className={d.dashboard.tdStrong}>{row.caseId}</td>
                        <td className={d.dashboard.tdTruncate}>{row.location}</td>
                        <td className={d.dashboard.thHiddenMd}>{titleCase(row.requesterName || 'Unknown')}</td>
                        <td>
                          {row.status ? (
                            <span className={d.dashboard.statusChip}>
                              {formatIncidentStatus(row.status)}
                            </span>
                          ) : (
                            <span className={d.dashboard.muted}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {incidents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={d.table.empty}>No incident reports yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className={d.dashboard.statusMapPanel}>
              <div className={d.dashboard.statusColumn}>
                <div className={d.dashboard.statusCard}>
                  <h3 className={d.dashboard.statusTitle}>Evacuation Area Status</h3>
                  <div className={d.dashboard.statusList}>
                    {statusRows.map((area, idx) => (
                      <article
                        key={area.id}
                        className={[d.dashboard.areaCardBase, idx === 0 ? d.dashboard.areaCardActive : d.dashboard.areaCardIdle].join(' ')}
                      >
                        <p className={d.dashboard.areaName}>{area.name}</p>
                        <p className={d.dashboard.areaBarangay}>Barangay {area.barangay}</p>
                        <div className={d.dashboard.areaMeta}>
                          <span className={d.dashboard.areaOcc}>{area.occupancyLabel}</span>
                          <span className={d.dashboard.areaCap}>Capacity: {area.capacity}</span>
                        </div>
                        <p className={d.dashboard.areaBarangay}>Status: {area.occupancyStatus}</p>
                      </article>
                    ))}
                  </div>
                </div>

              </div>

              <div
                ref={mapWrapRef}
                className={d.dashboard.mapWrap}
                style={isMapFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, borderRadius: 0, minHeight: '100dvh' } : { position: 'relative' }}
              >
                <div className="shrink-0 border-b border-slate-200 px-3 py-2"><h2 className="font-black text-[#173750]">Operations Map</h2><p className="text-xs text-slate-500">Active incidents and evacuation centers across Calamba City</p></div>
                <iframe ref={mapFrameRef} onLoad={() => { setMapReady(true); postMapUpdate(Boolean(focusKey)); }} title="Operations map" srcDoc={mapHtml} className={d.dashboard.mapFrame} />
                {!isMapFullscreen ? (
                  <button
                    onClick={enterMapFullscreen}
                    title="Enter fullscreen"
                    style={{
                      position: 'absolute', bottom: 10, right: 10, zIndex: 1000,
                      background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.3)',
                      borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 7px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(4px)', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={exitMapFullscreen}
                    title="Exit fullscreen"
                    style={{
                      position: 'absolute', bottom: 16, right: 16, zIndex: 10000,
                      background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.4)',
                      borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '7px 8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(4px)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                    </svg>
                  </button>
                )}
              </div>
            </article>
          </section>

          <section className={d.dashboard.insightsRow}>
            <section className={d.dashboard.waterLevels} aria-labelledby="dashboard-flood-monitoring-title">
              <div className={d.dashboard.waterLevelsHead}>
                <h3 id="dashboard-flood-monitoring-title" className={d.dashboard.waterLevelsTitle}>Flood Monitoring</h3>
                <button type="button" onClick={onOpenFloodMonitoring} className={d.dashboard.waterLevelsLink}>View details</button>
              </div>
              <div className={d.dashboard.waterLevelsLabels}>
                <span>Barangay</span><span>Status</span><span>Water</span><span>Distance</span><span>Temp</span><span>Humidity</span>
              </div>
              <div className={d.dashboard.waterLevelsList}>
                {waterLevelSensors.map((sensor) => (
                  <div key={sensor.id} className={[d.dashboard.waterLevelsRow, waterLevelRowColor(sensor)].join(' ')}>
                    <span className={d.dashboard.waterLevelsBarangay}>{sensor.barangayName}</span>
                    <span className={[d.dashboard.waterLevelsStatus, sensor.status === 'Active' ? d.dashboard.waterLevelsStatusActive : d.dashboard.waterLevelsStatusUnavailable].join(' ')}>{sensor.status}</span>
                    <span>{sensor.status === 'Unavailable' ? '--' : sensor.hasReading ? `${sensor.waterLevelPercentage.toFixed(0)}%` : 'No reading'}</span>
                    <span>{sensor.status === 'Unavailable' || sensor.distanceCm === null ? '-' : `${sensor.distanceCm.toFixed(1)} cm`}</span>
                    <span>{sensor.status === 'Unavailable' || sensor.temperatureCelsius === null ? '--' : `${sensor.temperatureCelsius.toFixed(1)}°C`}</span>
                    <span>{sensor.status === 'Unavailable' || sensor.humidityPercentage === null ? '--' : `${sensor.humidityPercentage.toFixed(0)}%`}</span>
                  </div>
                ))}
                {waterLevelSensors.length === 0 ? <p className={d.dashboard.waterLevelsEmpty}>Loading sensor readings...</p> : null}
              </div>
            </section>

            <div className={d.dashboard.rainRankCard}>
              <div className={d.dashboard.rainRankHead}>
                <h3 className={d.dashboard.rainRankTitle}>Barangays with Moderate–Severe Rainfall</h3>
                <p className={d.dashboard.rainRankUpdated}>Updated: {rainLegendUpdatedAt ? new Date(rainLegendUpdatedAt).toLocaleTimeString() : '-'}</p>
              </div>
              <div className={d.table.wrap}>
                <table className={d.table.main}>
                  <thead><tr><th>#</th><th>Barangay</th><th>Intensity</th><th>Risk</th></tr></thead>
                  <tbody>
                    {topRainBarangays.map((item, index) => (
                      <tr key={`${item.barangayName}-${index}`}>
                        <td>{index + 1}</td>
                        <td className={d.dashboard.rainRankName}>{item.barangayName}</td>
                        <td>{item.rainIntensityMmPerHour.toFixed(2)} mm/hr</td>
                        <td><span className={d.dashboard.statusChip}>{item.rainLevel}</span></td>
                      </tr>
                    ))}
                    {!topRainBarangays.length ? <tr><td colSpan={4} className={d.table.empty}>No moderate or severe rainfall detected right now.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {loading ? <p role="status" className="absolute bottom-2 left-2 z-20 rounded bg-white/90 px-2 py-1 text-xs text-slate-500 shadow">Refreshing dashboard data...</p> : null}

          <button
            type="button"
            onClick={onOpenPostUpdates}
            className={d.dashboard.postUpdateFab}
            aria-label="Post Update"
            title="Post Update"
          >
            <span className={d.dashboard.postUpdateFabIcon} aria-hidden="true">+</span>
            <span className={d.dashboard.postUpdateFabLabel}>Post Update</span>
          </button>

      </div>
    </AdminShell>
  );
}
