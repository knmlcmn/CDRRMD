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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const acknowledging = useRef(false);
  const pending = useRef(false);
  const reminderTimers = useRef(new Map<number, number>());
  useEffect(() => {
    let stopped = false;
    const timers = reminderTimers.current;
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
      timers.forEach((reminderTimer) => window.clearTimeout(reminderTimer));
      timers.clear();
    };
  }, []);
  const active = requests.find((request) =>
    !request.acknowledged_at && !dismissed.has(request.id));
  if (!active) return null;
  const dismiss = () => {
    if (acknowledging.current) return;
    setError('');
    setDismissed((current) => new Set(current).add(active.id));
    const previousTimer = reminderTimers.current.get(active.id);
    if (previousTimer) window.clearTimeout(previousTimer);
    reminderTimers.current.set(active.id, window.setTimeout(() => {
      reminderTimers.current.delete(active.id);
      setDismissed((current) => {
        const next = new Set(current);
        next.delete(active.id);
        return next;
      });
    }, 5000));
  };
  const acknowledge = async () => {
    if (acknowledging.current) return;
    acknowledging.current = true;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch<{ acknowledged_at: string }>('/backup-requests/' + active.id + '/acknowledge');
      setRequests((previous) => previous.map((request) => request.id === active.id
        ? { ...request, acknowledged_at: data.acknowledged_at } : request));
      onConfirm(active.report_id);
    } catch {
      setError('Unable to confirm this backup request. Please try again.');
    } finally {
      acknowledging.current = false;
      setBusy(false);
    }
  };
  return <BackupModal key={active.id} title="CDRRMD Backup Requested" onClose={dismiss}>
    <p><strong>Barangay:</strong> {active.barangay_name}</p>
    <p><strong>Rescue request:</strong> {active.report_code}</p>
    <p><strong>Incident:</strong> {String(active.incident_type || '-').replace(/_/g, ' ')}</p>
    <p><strong>Location:</strong> {active.report_location}</p>
    <p><strong>Resident:</strong> {active.reporter_name || '-'}</p>
    <p><strong>Contact:</strong> {active.reporter_contact || '-'}</p>
    <p><strong>People trapped:</strong> {active.are_people_trapped == null ? '-' : active.are_people_trapped ? 'Yes' : 'No'}</p>
    <p><strong>Estimated people:</strong> {active.estimated_people ?? '-'}</p>
    {active.report_notes ? <p><strong>Details:</strong> {active.report_notes}</p> : null}
    <p><strong>Requested:</strong> {new Date(active.created_at).toLocaleString()}</p>
    <p>Dismissed notifications return after 5 seconds. Confirming dispatches CDRRMD while the barangay continues responding.</p>
    {error && <p role="alert" className="backup-error">{error}</p>}
    <div className="backup-actions">
      <button className="backup-button backup-button-secondary" disabled={busy} onClick={dismiss}>Dismiss</button>
      <button className="backup-button" disabled={busy} onClick={() => { void acknowledge(); }}>
        {busy ? 'Confirming…' : 'Confirm'}
      </button>
    </div>
  </BackupModal>;
}
