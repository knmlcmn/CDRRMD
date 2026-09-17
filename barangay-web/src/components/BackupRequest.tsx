import { useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import BackupModal from './BackupModal';

export type BackupRequestState = {
  id: number;
  barangay_name: string;
  created_at: string;
  acknowledged_at: string | null;
  report_id: number | null;
  report_code: string | null;
  report_location: string | null;
  report_latitude: number | null;
  report_longitude: number | null;
};
type Mode = 'request' | 'sent' | 'arrived' | 'complete' | null;

type Props = {
  reportId: number | null;
  onRequestChange?: (request: BackupRequestState | null) => void;
};

export default function BackupRequest({ reportId, onRequestChange }: Props) {
  const [active, setActive] = useState<BackupRequestState | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const mutation = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let stopped = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching || mutation.current) return;
      fetching = true;
      const version = generation.current;
      try {
        const { data } = await api.get<BackupRequestState[]>('/backup-requests');
        if (!stopped && version === generation.current) {
          const next = data[0] || null;
          setActive((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
          setLoaded(true);
          setError('');
        }
      } catch {
        if (!stopped && version === generation.current) setError('Cannot check backup status. Retrying shortly.');
      } finally { fetching = false; }
    };
    void refresh();
    // Reflect an admin acknowledgment on the barangay button promptly.
    const timer = window.setInterval(() => { void refresh(); }, 1000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    onRequestChange?.(active);
  }, [active, onRequestChange]);

  const submit = async () => {
    if (mutation.current) return;
    mutation.current = true;
    generation.current += 1;
    setBusy(true);
    setError('');
    try {
      if (mode === 'arrived' && active) {
        await api.patch('/backup-requests/' + active.id + '/arrived');
        setActive(null);
        setMode('complete');
      } else if (mode === 'request') {
        const { data } = await api.post<BackupRequestState>('/backup-requests', { reportId });
        setActive(data);
        setMode('sent');
      }
    } catch {
      setError('Unable to save. Please check your connection and try again.');
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const close = () => { if (!busy) setMode(null); };
  return (
    <div>
      <span className="backup-tooltip-wrap">
        <button className={`backup-button ${active?.acknowledged_at ? 'backup-button-acknowledged' : ''}`} disabled={!loaded || busy || (!active && !reportId)}
          aria-describedby="backup-tooltip" onClick={() => { setError(''); setMode(active ? 'arrived' : 'request'); }}>
          {active ? 'Confirm Backup Arrived' : 'Request Backup'}
        </button>
        <span role="tooltip" id="backup-tooltip" className="backup-tooltip">
          {active ? 'Confirm that CDRRMD backup is now there' : 'Request Backup from CDRRMD now'}
        </span>
      </span>
      {error && !mode && <p role="alert" className="backup-error">{error}</p>}
      {mode && <BackupModal title={mode === 'request' ? 'Request Backup?' : mode === 'sent' ? 'Backup Request Sent' : mode === 'arrived' ? 'Confirm Backup Arrival?' : 'Backup Arrival Confirmed'} onClose={close}>
        <p>{mode === 'request' ? 'Proceed with requesting backup from CDRRMD now?' :
          mode === 'sent' ? 'Your backup request has been sent to CDRRMD. Admins will be reminded every 5 minutes until you confirm backup has arrived.' :
          mode === 'arrived' ? 'Has CDRRMD backup arrived at your barangay? Confirming will stop the admin reminders.' :
          'Backup arrival is confirmed. Admin reminders have stopped.'}</p>
        {error && <p role="alert" className="backup-error">{error}</p>}
        <div className="backup-actions">
          {mode === 'request' || mode === 'arrived' ? <>
            <button className="backup-button-secondary backup-button" disabled={busy} onClick={close}>Cancel</button>
            <button className="backup-button" disabled={busy} onClick={() => { void submit(); }}>
              {busy ? 'Sending?' : mode === 'request' ? 'Yes, Request Backup' : 'Yes, Backup Has Arrived'}
            </button>
          </> : <button className="backup-button" onClick={close}>OK</button>}
        </div>
      </BackupModal>}
    </div>
  );
}
