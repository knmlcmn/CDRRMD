import { useEffect, useState } from 'react';
import { api } from '../services/apiClient';

type HistoryKind = 'incidents' | 'backups' | 'water-levels';
type HistoryRow = Record<string, string | number | null>;
type HistoryResponse = {
  items: HistoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Props = {
  scopeLabel: string;
  onAuthError: () => void;
};

const TABS: Array<{ key: HistoryKind; label: string }> = [
  { key: 'incidents', label: 'Incident Reports' },
  { key: 'backups', label: 'Backup Requests' },
  { key: 'water-levels', label: 'Water-Level Logs' },
];
const MONTHS = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(new Date(2024, index, 1)));
const YEARS = Array.from({ length: Math.max(1, new Date().getFullYear() - 1999) }, (_, index) => new Date().getFullYear() - index);

function dateText(value: unknown) {
  if (!value) return '-';
  return new Date(String(value)).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function titleText(value: unknown) {
  return String(value || '-').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function distanceText(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const distanceCm = Number(value);
  return Number.isFinite(distanceCm) ? `${distanceCm.toFixed(1)} cm` : '-';
}

function tableFor(kind: HistoryKind, rows: HistoryRow[], loading: boolean) {
  if (kind === 'incidents') {
    return <table className="min-w-[900px] w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-[#12314b] text-white"><tr><th className="px-3 py-3">Incident ID</th><th className="px-3 py-3">Requester</th><th className="px-3 py-3">Barangay</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Reported</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} className="border-t border-slate-200 even:bg-slate-50 hover:bg-blue-50"><td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-bold">{row.report_code}</td><td className="px-3 py-3"><p className="font-semibold">{row.reporter_name || 'Unknown user'}</p><p className="font-mono text-xs text-slate-500">{row.reporter_account_id || '-'}</p></td><td className="px-3 py-3">{row.assigned_barangay || '-'}</td><td className="max-w-72 px-3 py-3">{row.location || '-'}</td><td className="px-3 py-3"><span className="status-chip bg-slate-100 text-slate-700">{titleText(row.status)}</span></td><td className="whitespace-nowrap px-3 py-3">{dateText(row.created_at)}</td></tr>)}{!loading && !rows.length ? <tr><td colSpan={6} className="px-3 py-12 text-center text-slate-500">No incident reports match these filters.</td></tr> : null}</tbody></table>;
  }
  if (kind === 'backups') {
    return <table className="min-w-[1100px] w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-[#12314b] text-white"><tr><th className="px-3 py-3">Backup ID</th><th className="px-3 py-3">Incident ID</th><th className="px-3 py-3">Barangay</th><th className="px-3 py-3">Requested By</th><th className="px-3 py-3">Assigned Rescuer</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Requested</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} className="border-t border-slate-200 even:bg-slate-50 hover:bg-blue-50"><td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-bold">BKP-{new Date(String(row.created_at)).getFullYear()}-{String(row.id).padStart(5, '0')}</td><td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.report_code || '-'}</td><td className="px-3 py-3">{row.barangay_name || '-'}</td><td className="px-3 py-3">{row.requested_by_name || '-'}</td><td className="px-3 py-3"><p>{row.rescuer_name || '-'}</p><p className="font-mono text-xs text-slate-500">{row.rescuer_account_id || ''}</p></td><td className="px-3 py-3"><span className="status-chip bg-slate-100 text-slate-700">Completed</span></td><td className="whitespace-nowrap px-3 py-3">{dateText(row.created_at)}</td></tr>)}{!loading && !rows.length ? <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-500">No completed backup requests match these filters.</td></tr> : null}</tbody></table>;
  }
  return <table className="min-w-[850px] w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-[#12314b] text-white"><tr><th className="px-3 py-3">Log ID</th><th className="px-3 py-3">Hardware</th><th className="px-3 py-3">Barangay</th><th className="px-3 py-3">Level</th><th className="px-3 py-3">Water Reading</th><th className="px-3 py-3">Distance (cm)</th><th className="px-3 py-3">Logged</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} className="border-t border-slate-200 even:bg-slate-50 hover:bg-blue-50"><td className="whitespace-nowrap px-3 py-3 font-mono text-xs">WTR-{String(row.id).padStart(6, '0')}</td><td className="px-3 py-3 font-bold">{row.hardware_no || '-'}</td><td className="px-3 py-3">{row.barangay_name || '-'}</td><td className="px-3 py-3"><span className="status-chip bg-amber-100 text-amber-800">{titleText(row.level)}</span></td><td className="px-3 py-3 text-lg font-black text-[#19374f]">{Number(row.water_level_percentage || 0).toFixed(0)}%</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{distanceText(row.distance_cm)}</td><td className="whitespace-nowrap px-3 py-3">{dateText(row.created_at)}</td></tr>)}{!loading && !rows.length ? <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-500">No hardware water-level logs match these filters.</td></tr> : null}</tbody></table>;
}

export default function HistoryRecordsPanel({ scopeLabel, onAuthError }: Props) {
  const [kind, setKind] = useState<HistoryKind>('incidents');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryResponse>({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); }, [kind, month, search, year]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get<HistoryResponse>(`/history/${kind}`, {
          params: { page, month: month || undefined, year: year || undefined, search: search.trim() || undefined },
          signal: controller.signal,
        });
        setResult(data);
      } catch (caught: unknown) {
        if (controller.signal.aborted) return;
        const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
        if (apiError.response?.status === 401) onAuthError();
        else setError(apiError.response?.data?.message || 'Unable to load history records.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, month, onAuthError, page, search, year]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="History category">
        {TABS.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={kind === tab.key} onClick={() => setKind(tab.key)} className={`rounded-lg px-4 py-2.5 text-sm font-black ${kind === tab.key ? 'bg-[#1f4e79] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{tab.label}</button>)}
      </div>
      <p className="mt-3 text-sm text-slate-500">Complete records available to {scopeLabel}. Twenty records are displayed per page.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_150px_auto]">
        <label className="text-xs font-bold text-slate-600">Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names, IDs, barangay, or hardware" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
        </label>
        <label className="text-xs font-bold text-slate-600">Month
          <select value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"><option value="">All months</option>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
        </label>
        <label className="text-xs font-bold text-slate-600">Year
          <select value={year} onChange={(event) => setYear(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"><option value="">All years</option>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <button type="button" onClick={() => { setSearch(''); setMonth(''); setYear(''); }} className="h-11 self-end rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Clear</button>
      </div>

      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <div className="mt-4 max-h-[calc(100dvh-22rem)] overflow-auto rounded-lg border border-slate-200">{tableFor(kind, result.items, loading)}{loading ? <p className="p-8 text-center text-sm font-semibold text-slate-500">Loading history...</p> : null}</div>
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{result.total ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}` : '0 records'}</p>
        <div className="flex items-center gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Previous</button><span className="min-w-24 text-center text-sm font-bold text-slate-700">Page {result.page} of {result.totalPages}</span><button type="button" disabled={loading || page >= result.totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Next</button></div>
      </footer>
    </section>
  );
}
