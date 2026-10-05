import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/apiClient';

type IncidentHistoryRecord = {
  id: number;
  report_code: string | null;
  report_type: string | null;
  incident_type: string | null;
  status: string;
  location: string | null;
  assigned_barangay: string | null;
  evacuation_area_name: string | null;
  created_at: string;
  resolved_at: string | null;
  reporter_id: number | null;
  reporter_account_id: string | null;
  reporter_name: string | null;
  reporter_username: string | null;
  contact_number: string | null;
  email: string | null;
};

type Props = {
  open: boolean;
  scopeLabel: string;
  onClose: () => void;
  onAuthError: () => void;
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(new Date(2024, index, 1)),
}));

function displayText(value?: string | null) {
  return String(value || '-')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function IncidentHistoryModal({ open, scopeLabel, onClose, onAuthError }: Props) {
  const [records, setRecords] = useState<IncidentHistoryRecord[]>([]);
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [knownYears, setKnownYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get<IncidentHistoryRecord[]>('/reports/history', {
          params: { month: month || undefined, year: year || undefined, search: search.trim() || undefined },
          signal: controller.signal,
        });
        const nextRecords = Array.isArray(data) ? data : [];
        setRecords(nextRecords);
        const receivedYears = nextRecords
          .map((record) => new Date(record.created_at).getFullYear())
          .filter(Number.isFinite);
        setKnownYears((current) => Array.from(new Set([...current, ...receivedYears])).sort((left, right) => right - left));
      } catch (requestError: unknown) {
        if (controller.signal.aborted) return;
        const apiError = requestError as ApiError;
        if (apiError.response?.status === 401) {
          onAuthError();
          return;
        }
        setRecords([]);
        setError(apiError.response?.data?.message || 'Incident history could not be loaded. Please try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [month, onAuthError, open, search, year]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(new Set([currentYear, ...knownYears])).sort((left, right) => right - left);
  }, [knownYears]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="incident-history-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <h2 id="incident-history-title" className="text-lg font-black text-[#19374f]">Incident Report History</h2>
            <p className="mt-1 text-sm text-slate-500">Assistance requests visible to {scopeLabel}.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </header>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-[minmax(220px,1fr)_180px_150px] sm:px-5">
          <label className="text-xs font-bold text-slate-600">Search by name or ID
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, user ID, or incident ID" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800" />
          </label>
          <label className="text-xs font-bold text-slate-600">Month
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
              <option value="">All months</option>
              {MONTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Year
            <select value={year} onChange={(event) => setYear(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
              <option value="">All years</option>
              {yearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
          <table className="data-table min-w-[1050px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr><th>Incident ID</th><th>User ID</th><th>Requester</th><th>Type</th><th>Barangay</th><th>Location</th><th>Status</th><th>Requested</th></tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="text-slate-700">
                  <td className="font-mono text-xs">{record.report_code || `RPT-${String(record.id).padStart(6, '0')}`}</td>
                  <td className="font-mono text-xs">{record.reporter_account_id || (record.reporter_id ? `USR-${record.reporter_id}` : '-')}</td>
                  <td><p className="font-bold text-slate-800">{record.reporter_name || record.reporter_username || 'Unknown user'}</p><p className="text-xs text-slate-500">{record.contact_number || record.email || 'No contact provided'}</p></td>
                  <td>{displayText(record.incident_type || record.report_type)}</td>
                  <td>{record.assigned_barangay || '-'}</td>
                  <td className="max-w-64 truncate" title={record.location || ''}>{record.location || '-'}</td>
                  <td><span className="status-chip bg-slate-100 text-slate-700">{displayText(record.status)}</span></td>
                  <td className="whitespace-nowrap text-xs">{formatDate(record.created_at)}</td>
                </tr>
              ))}
              {!loading && records.length === 0 && !error ? <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">No incident reports match these filters.</td></tr> : null}
            </tbody>
          </table>
          {loading ? <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Loading incident history...</div> : null}
        </div>
        <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 sm:px-5">{loading ? 'Updating records...' : `${records.length} record${records.length === 1 ? '' : 's'} shown`}</footer>
      </section>
    </div>
  );
}
