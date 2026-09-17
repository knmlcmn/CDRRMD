import { useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import BackupModal from './BackupModal';

type Request = {
  id: number;
  barangay_name: string;
  created_at: string;
  reminder_sequence: number;
  acknowledged_at: string | null;
  report_code: string | null;
  reporter_name: string | null;
};

export default function BackupNotifications() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [dismissed, setDismissed] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
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
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const active = requests.find((request) =>
    !request.acknowledged_at && dismissed[request.id] !== request.reminder_sequence);
  if (!active) return null;
  const dismiss = () => {
    if (acknowledging.current) return;
    setError('');
    setDismissed((previous) => ({ ...previous, [active.id]: active.reminder_sequence }));
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
      setDismissed((previous) => ({ ...previous, [active.id]: active.reminder_sequence }));
    } catch {
      setError('Unable to acknowledge this request. Please try again.');
    } finally {
      acknowledging.current = false;
      setBusy(false);
    }
  };
  return <BackupModal key={active.id} title="Backup Requested" onClose={dismiss}>
    <p><strong>Barangay {active.barangay_name}</strong> is requesting backup from CDRRMD.</p>
    {active.report_code && <p><strong>Incident:</strong> {active.report_code}{active.reporter_name ? ` — ${active.reporter_name}` : ''}</p>}
    <p>Requested: {new Date(active.created_at).toLocaleString()}</p>
    <p>Reminders return on refresh, page changes, or every 5 minutes until the barangay confirms backup has arrived.</p>
    {error && <p role="alert" className="backup-error">{error}</p>}
    <div className="backup-actions">
      <button className="backup-button backup-button-secondary" disabled={busy} onClick={dismiss}>Dismiss Request</button>
      <button className="backup-button" disabled={busy} onClick={() => { void acknowledge(); }}>
        {busy ? 'Acknowledging…' : 'Acknowledge Request'}
      </button>
    </div>
  </BackupModal>;
}
