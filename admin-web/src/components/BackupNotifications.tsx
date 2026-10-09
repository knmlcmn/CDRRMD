import { useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import BackupModal from './BackupModal';
import RescueRequestRouteMap from '../barangay/components/RescueRequestRouteMap';
import RescueImagePreview from '../barangay/components/RescueImagePreview';
import '../barangay/components/BackupModal.css';

type Request = {
  id: number;
  barangay_name: string;
  created_at: string;
  acknowledged_at: string | null;
  report_id: number;
  report_code: string;
  incident_type: string | null;
  report_location: string;
  report_latitude: number | string | null;
  report_longitude: number | string | null;
  report_notes: string | null;
  are_people_trapped: boolean | null;
  estimated_people: number | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  reporter_email: string | null;
  evacuation_area_name: string | null;
  evacuation_latitude: number | string | null;
  evacuation_longitude: number | string | null;
  image_base64?: string | null;
  has_image?: boolean;
};

export default function BackupNotifications({ reopenReportId, onStandby, onConfirm }: {
  reopenReportId: number | null;
  onStandby: () => void;
  onConfirm: (reportId: number) => void;
}) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<'confirm' | null>(null);
  const [error, setError] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [routeMetrics, setRouteMetrics] = useState<{ distanceKm: number; etaMinutes: number } | null>();
  const acknowledging = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      if (pending.current) return;
      pending.current = true;
      try {
        const { data } = await api.get<Request[]>('/backup-requests');
        if (!stopped) setRequests(data);
      } catch {
        // Retain outstanding alerts during outages and retry on the next poll.
      } finally { pending.current = false; }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const active = requests.find((request) =>
    !request.acknowledged_at && Number(request.report_id) === reopenReportId)
    ?? requests.find((request) => !request.acknowledged_at && !dismissed.has(request.id));

  useEffect(() => {
    setShowImage(false);
    setProofImage(null);
    setRouteMetrics(undefined);
  }, [active?.id]);

  if (!active) return null;

  const standby = () => {
    if (busy) return;
    setDismissed((current) => new Set(current).add(active.id));
    onStandby();
  };
  const confirmDispatch = async () => {
    if (acknowledging.current) return;
    acknowledging.current = true;
    setBusy('confirm');
    setError('');
    try {
      const { data: preview } = await api.get<{ rescuer?: { rescuerId?: number } | null }>(`/backup-requests/${active.id}/rescuer-preview`);
      if (!preview?.rescuer?.rescuerId) {
        throw new Error('No available CDRRMD Rescuer can be dispatched right now.');
      }
      await api.patch(`/backup-requests/${active.id}/acknowledge`, { rescuerId: preview.rescuer.rescuerId });
      setDismissed((current) => new Set(current).add(active.id));
      setRequests((current) => current.filter((request) => request.id !== active.id));
      onStandby();
      onConfirm(active.report_id);
    } catch (requestError: unknown) {
      const apiError = requestError as { response?: { data?: { message?: string } }; message?: string };
      setError(apiError.response?.data?.message || apiError.message || 'Unable to confirm dispatch. Please try again.');
    } finally {
      acknowledging.current = false;
      setBusy(null);
    }
  };
  const residentName = active.reporter_name || 'Resident';
  const residentLatitude = Number(active.report_latitude);
  const residentLongitude = Number(active.report_longitude);
  const evacuationLatitude = Number(active.evacuation_latitude);
  const evacuationLongitude = Number(active.evacuation_longitude);
  const hasRouteLocations = [residentLatitude, residentLongitude, evacuationLatitude, evacuationLongitude].every(Number.isFinite);
  const reportDescription = String(active.report_notes || '').trim();
  const visibleDescription = /^selected evacuation area:/i.test(reportDescription) ? '' : reportDescription;
  const openProofImage = async () => {
    if (active.image_base64) {
      setProofImage(active.image_base64);
      setShowImage(true);
      return;
    }
    setProofLoading(true);
    setError('');
    try {
      const { data } = await api.get<{ image_base64?: string | null }>(`/reports/${active.report_id}/image`);
      if (data.image_base64) {
        setProofImage(data.image_base64);
        setShowImage(true);
      }
    } catch (requestError: unknown) {
      const apiError = requestError as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Unable to load the proof image.');
    } finally {
      setProofLoading(false);
    }
  };

  return <>
    <BackupModal key={active.id} title="Urgent Backup Request" variant="rescue-request" onClose={standby}>
      <div className="rescue-request-layout">
        <div className="rescue-request-content">
          <p className="rescue-request-eyebrow">Urgent Backup Request · Barangay {active.barangay_name}</p>
          <h2 className="rescue-request-title">{residentName}</h2>
          <p className="rescue-request-subtitle">{String(active.incident_type || 'Request Rescue').replace(/_/g, ' ')}</p>
          <dl className="rescue-request-details">
            <div><dt>Contact</dt><dd>{active.reporter_contact || active.reporter_email || 'Not provided'}</dd></div>
            <div><dt>People</dt><dd>{active.estimated_people || 1}</dd></div>
            <div><dt>Rescue location</dt><dd>{active.report_location}</dd></div>
            <div><dt>Assigned evacuation</dt><dd>{active.evacuation_area_name || 'Automatic nearest center'}</dd></div>
            <div><dt>Shortest route</dt><dd>{routeMetrics ? `${routeMetrics.distanceKm.toFixed(2)} km · about ${routeMetrics.etaMinutes} min` : routeMetrics === null ? 'Road route unavailable' : 'Calculating…'}</dd></div>
          </dl>
          {visibleDescription ? <p className="rescue-request-description">{visibleDescription}</p> : null}
          {active.has_image || active.image_base64 ? (
            <div className="rescue-request-meta-row">
              <span>{active.report_code}</span>
              <button type="button" disabled={proofLoading} className="rescue-request-view-image" onClick={() => void openProofImage()}>{proofLoading ? 'Loading…' : 'View Image'}</button>
            </div>
          ) : <p className="rescue-request-meta">{active.report_code} · Requested {new Date(active.created_at).toLocaleString()}</p>}
        </div>
        {hasRouteLocations ? (
          <RescueRequestRouteMap
            resident={{ latitude: residentLatitude, longitude: residentLongitude }}
            evacuationArea={{ latitude: evacuationLatitude, longitude: evacuationLongitude }}
            residentName={residentName}
            evacuationAreaName={active.evacuation_area_name || 'Assigned evacuation center'}
            onRouteMetrics={setRouteMetrics}
          />
        ) : <div className="rescue-request-route-unavailable">Route location unavailable</div>}
      </div>
      {error ? <p role="alert" className="rescue-request-error">{error}</p> : null}
      <div className="rescue-request-actions">
        <button className="rescue-request-button rescue-request-button-primary" disabled={busy !== null} onClick={() => void confirmDispatch()}>
          {busy === 'confirm' ? 'Confirming…' : 'Confirm Dispatch'}
        </button>
        <button className="rescue-request-button" disabled={busy !== null} onClick={standby}>Standby Request</button>
      </div>
    </BackupModal>
    {showImage && proofImage ? (
      <RescueImagePreview image={proofImage} residentName={residentName} createdAt={active.created_at} onClose={() => setShowImage(false)} />
    ) : null}
  </>;
}
