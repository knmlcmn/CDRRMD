import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/apiClient';
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
  assigned_rescuer_id: number | null;
  assigned_at: string | null;
  responder_acknowledged_at: string | null;
  picked_up_at: string | null;
  rescuer_name?: string | null;
  rescuer_account_id?: string | null;
  evacuation_latitude?: number | null;
  evacuation_longitude?: number | null;
};
type Mode = 'request' | 'sent' | null;

type Props = {
  reportId: number | null;
  onRequestChange?: (request: BackupRequestState | null) => void;
};

export default function BackupRequest({ reportId, onRequestChange }: Props) {
  const [active, setActive] = useState<BackupRequestState | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mutation = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let stopped = false;
    let fetching = false;
    setActive(null);
    const refresh = async () => {
      if (fetching || mutation.current) return;
      fetching = true;
      const version = generation.current;
      try {
        const { data } = await api.get<BackupRequestState[]>('/backup-requests');
        if (!stopped && version === generation.current) {
          const next = reportId == null
            ? null
            : data.find((request) => Number(request.report_id) === reportId) || null;
          setActive((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
          setError('');
        }
      } catch {
        if (!stopped && version === generation.current) setError('Cannot check backup status. Retrying shortly.');
      } finally { fetching = false; }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [reportId]);

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
      if (mode === 'request') {
        const { data } = await api.post<BackupRequestState>('/backup-requests', { reportId });
        setActive(data);
        setMode('sent');
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Unable to save. Please check your connection and try again.');
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const close = () => { if (!busy) setMode(null); };
  return (
    <div>
      <span className="backup-tooltip-wrap">
        <button className={`backup-button ${active?.acknowledged_at ? 'backup-button-acknowledged' : ''}`} disabled={busy || reportId == null || Boolean(active)}
          aria-describedby="backup-tooltip" onClick={() => { setError(''); setMode('request'); }}>
          {active?.picked_up_at ? 'Transporting to Evacuation' : active?.responder_acknowledged_at ? 'CDRRMD Dispatch Active' : active?.assigned_rescuer_id ? 'Awaiting CDRRMD Ack' : active?.acknowledged_at ? 'Assigning Nearest Team' : active ? 'Backup Requested' : 'Request Backup'}
        </button>
        <span role="tooltip" id="backup-tooltip" className="backup-tooltip">
          {active
            ? 'Barangay and CDRRMD response stays active until the resident is rescued.'
            : reportId
              ? 'Request backup from CDRRMD while the barangay continues responding.'
              : 'Accept and select a rescue request before requesting CDRRMD backup.'}
        </span>
      </span>
      {error && !mode && <p role="alert" className="backup-error">{error}</p>}
      {mode && <BackupModal title={mode === 'request' ? 'Request Backup?' : 'Backup Request Sent'} onClose={close}>
        <p>{mode === 'request'
          ? reportId
            ? 'Request CDRRMD backup for this rescue? Your barangay must continue responding and cooperating until the resident is rescued.'
            : 'There is no active rescue request available. Select or accept a pending rescue request before requesting CDRRMD backup.'
          : 'Your request was sent. The Admin will be reminded every 5 seconds until it is confirmed. Barangay and CDRRMD will respond together until the resident is rescued.'}</p>
        {error && <p role="alert" className="backup-error">{error}</p>}
        <div className="backup-actions">
          {mode === 'request' && reportId ? <>
            <button className="backup-button-secondary backup-button" disabled={busy} onClick={close}>Cancel</button>
            <button className="backup-button" disabled={busy} onClick={() => { void submit(); }}>
              {busy ? 'Sending…' : 'Yes, Request Backup'}
            </button>
          </> : <button className="backup-button" onClick={close}>OK</button>}
        </div>
      </BackupModal>}
    </div>
  );
}
