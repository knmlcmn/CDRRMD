import { useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import BackupModal from './BackupModal';

type Request = {
  id: number;
  barangay_name: string;
  created_at: string;
  acknowledged_at: string | null;
  report_id: number;
  report_code: string;
  incident_type: string | null;
  report_location: string;
  report_notes: string | null;
  are_people_trapped: boolean | null;
  estimated_people: number | null;
  reporter_name: string | null;
  reporter_contact: string | null;
};

export default function BackupNotifications({ onConfirm }: { onConfirm: (reportId: number) => void }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | null>(null);
  const [error, setError] = useState('');
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
    // Check frequently so a new barangay request opens on the admin page almost immediately.
    const timer = window.setInterval(() => { void refresh(); }, 1000);
    window.addEventListener('focus', refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const active = requests.find((request) =>
    !request.acknowledged_at && !dismissed.has(request.id));
  if (!active) return null;
  const dismiss = async () => {
    if (acknowledging.current) return;
    acknowledging.current = true;
    setBusy('dismiss');
    setError('');
    try {
      await api.patch(`/backup-requests/${active.id}/decline`, {
        reason: 'Dismissed from the urgent backup request notification.',
      });
      setDismissed((current) => new Set(current).add(active.id));
      setRequests((current) => current.filter((request) => request.id !== active.id));
    } catch (requestError: unknown) {
      const apiError = requestError as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Unable to dismiss this backup request. Please try again.');
    } finally {
      acknowledging.current = false;
      setBusy(null);
    }
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
      onConfirm(active.report_id);
    } catch (requestError: unknown) {
      const apiError = requestError as { response?: { data?: { message?: string } }; message?: string };
      setError(apiError.response?.data?.message || apiError.message || 'Unable to confirm dispatch. Please try again.');
    } finally {
      acknowledging.current = false;
      setBusy(null);
    }
  };
  return <BackupModal key={active.id} title="Urgent Backup Request" variant="urgent-backup" onClose={() => { if (!busy) void dismiss(); }}>
    <div className="urgent-backup-layout">
      <div>
        <p className="urgent-backup-eyebrow">Urgent Backup Request</p>
        <h2 className="urgent-backup-title">Barangay {active.barangay_name}</h2>
        <p className="urgent-backup-subtitle">Backup responders have not arrived</p>
        <p className="urgent-backup-description">
          The barangay reports that backup responders have not arrived at {active.report_location}. Please confirm dispatch and coordinate immediate assistance.
        </p>
        <p className="urgent-backup-meta">{active.report_code} · Requested {new Date(active.created_at).toLocaleString()}</p>
      </div>
      <svg className="urgent-backup-icon" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M52.8 17.2c3.2-5.5 11.2-5.5 14.4 0l43.1 74.7c3.2 5.5-.8 12.4-7.2 12.4H16.9c-6.4 0-10.4-6.9-7.2-12.4l43.1-74.7Z" fill="#fff7d6" stroke="currentColor" strokeWidth="5" />
        <path d="M60 40v34" stroke="#123a59" strokeWidth="8" strokeLinecap="round" />
        <circle cx="60" cy="88" r="5" fill="#123a59" />
      </svg>
    </div>
    {error ? <p role="alert" className="urgent-backup-error">{error}</p> : null}
    <div className="urgent-backup-actions">
      <button className="urgent-backup-button urgent-backup-button-primary" disabled={busy !== null} onClick={() => void confirmDispatch()}>
        {busy === 'confirm' ? 'Confirming…' : 'Confirm Dispatch'}
      </button>
      <button className="urgent-backup-button" disabled={busy !== null} onClick={() => void dismiss()}>
        {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss Request'}
      </button>
    </div>
  </BackupModal>;
}
