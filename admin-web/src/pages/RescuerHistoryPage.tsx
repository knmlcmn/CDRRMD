import { useCallback, useEffect, useMemo, useState } from 'react';
import RescuerShell from '../components/RescuerShell';
import { api } from '../services/apiClient';

type Props = {
  responderRole: 'rescuer' | 'barangay_rescuer';
  onLogout: () => void;
  onAuthError: () => void;
  onOpenIncidents: () => void;
  onOpenHistory: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
};

type AssignmentHistory = {
  backup_request_id: number;
  id: number;
  report_code: string;
  incident_type: string;
  status: string;
  location: string;
  assigned_barangay: string;
  evacuation_area_name: string | null;
  reporter_name: string | null;
  assigned_at: string;
  picked_up_at: string | null;
  arrived_at: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const PAGE_SIZE = 20;

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function assignmentId(value: number) {
  return `ASN-${String(value).padStart(6, '0')}`;
}

export default function RescuerHistoryPage(props: Props) {
  const { responderRole, onAuthError } = props;
  const [history, setHistory] = useState<AssignmentHistory[]>([]);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<AssignmentHistory[]>('/rescuers/incidents/history/all');
      setHistory(Array.isArray(data) ? data : []);
      setError('');
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) onAuthError();
      else setError(apiError.response?.data?.message || 'Unable to load assignment history.');
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const years = useMemo(() => Array.from(new Set(
    history.map((item) => new Date(item.arrived_at).getFullYear()).filter(Number.isFinite),
  )).sort((left, right) => right - left), [history]);

  const filteredHistory = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return history.filter((item) => {
      const completed = new Date(item.arrived_at);
      const matchesSearch = !needle || [
        item.report_code,
        item.backup_request_id,
        assignmentId(item.backup_request_id),
        item.id,
        item.reporter_name,
        item.assigned_barangay,
      ].some((value) => String(value || '').toLowerCase().includes(needle));
      const matchesMonth = month === 'all' || completed.getMonth() === Number(month);
      const matchesYear = year === 'all' || completed.getFullYear() === Number(year);
      return matchesSearch && matchesMonth && matchesYear;
    });
  }, [history, month, search, year]);

  useEffect(() => { setPage(1); }, [month, search, year]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const visibleHistory = filteredHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const roleLabel = responderRole === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer';

  return (
    <RescuerShell
      {...props}
      activeView="history"
      title="Assignment History"
      subtitle={`Complete ${roleLabel} rescue assignment records`}
    >
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-[#19374f]">Complete Rescue History</h2>
            <p className="mt-1 text-sm text-slate-500">This page keeps all completed assignments. The Incident Reports page shows only the current week.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_10rem_8rem_auto]">
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Search name or ID
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Resident, incident, or assignment ID"
                className="h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Month
              <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800">
                <option value="all">All months</option>
                {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Year
              <select value={year} onChange={(event) => setYear(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800">
                <option value="all">All years</option>
                {years.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => { setSearch(''); setMonth('all'); setYear('all'); }}
              className="h-11 self-end rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-600">{filteredHistory.length} of {history.length} assignments</p>
          <button type="button" onClick={() => void loadHistory()} disabled={loading} className="rounded-lg bg-[#1f4e79] px-4 py-2 text-sm font-bold text-white hover:bg-[#173b5c] disabled:opacity-60">{loading ? 'Loading...' : 'Refresh'}</button>
        </div>

        <div className="mt-3 max-h-[calc(100dvh-18rem)] overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#12314b] text-white">
              <tr><th className="px-3 py-3">Incident ID</th><th className="px-3 py-3">Assignment ID</th><th className="px-3 py-3">Resident</th><th className="px-3 py-3">Barangay</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Evacuation Area</th><th className="px-3 py-3">Assigned</th><th className="px-3 py-3">Completed</th></tr>
            </thead>
            <tbody>
              {visibleHistory.map((item) => (
                <tr key={item.backup_request_id} className="border-t border-slate-200 odd:bg-white even:bg-slate-50 hover:bg-blue-50">
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-[#19374f]">{item.report_code}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{assignmentId(item.backup_request_id)}</td>
                  <td className="px-3 py-3">{item.reporter_name || '-'}</td>
                  <td className="px-3 py-3">{item.assigned_barangay || '-'}</td>
                  <td className="max-w-64 px-3 py-3">{item.location || '-'}</td>
                  <td className="px-3 py-3">{item.evacuation_area_name || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-3">{item.assigned_at ? formatDate(item.assigned_at) : '-'}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-700">{formatDate(item.arrived_at)}</td>
                </tr>
              ))}
              {!loading && !filteredHistory.length ? <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">No assignment history matches the selected filters.</td></tr> : null}
              {loading && !history.length ? <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">Loading complete assignment history...</td></tr> : null}
            </tbody>
          </table>
        </div>
        <footer className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600">{filteredHistory.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredHistory.length)} of ${filteredHistory.length}` : '0 records'} · 20 per page</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Previous</button>
            <span className="min-w-24 text-center text-sm font-bold text-slate-700">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Next</button>
          </div>
        </footer>
      </section>
    </RescuerShell>
  );
}
