import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/apiClient';
import BarangayShell from '../components/BarangayShell';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onOpenDashboard: () => void;
  onAuthError: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
};

type Center = {
  id: number;
  name: string;
  barangay: string;
  capacity: number;
  current_count: number;
  remaining_capacity: number;
};

type EvacueeCase = {
  id: number;
  evacuation_area_id: number;
  evacuation_area_name: string;
  evacuation_area_barangay: string;
  report_code: string;
  incident_type: string;
  location: string;
  status: string;
  evacuees_reserved: number;
  created_at: string;
  evacuation_arrived_at: string | null;
  departure_requested_at: string | null;
  departure_confirmed_at: string | null;
  resident_name: string | null;
  contact_number: string | null;
  picked_up_at: string | null;
  rescuer_name: string | null;
};

type CasesPayload = {
  incoming: EvacueeCase[];
  outgoing: EvacueeCase[];
  current: EvacueeCase[];
  resolved: EvacueeCase[];
};

type Tab = 'incoming' | 'resolved' | 'outgoing';
type ApiError = { response?: { status?: number; data?: { message?: string } } };

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function EvacuationCenterPage({ barangayName, onLogout, onOpenDashboard, onAuthError, onOpenMonitoring, onOpenFloodMonitoring, onOpenAccount }: Props) {
  const [centers, setCenters] = useState<Center[]>([]);
  const [centerId, setCenterId] = useState<number | null>(null);
  const [cases, setCases] = useState<CasesPayload>({ incoming: [], outgoing: [], current: [], resolved: [] });
  const [tab, setTab] = useState<Tab>('incoming');
  const [search, setSearch] = useState('');
  const [manualCount, setManualCount] = useState('0');
  const [isManualCountDirty, setIsManualCountDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [savingCount, setSavingCount] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedCenter = centers.find((center) => center.id === centerId) || null;

  const loadCenters = useCallback(async () => {
    const { data } = await api.get<Center[]>('/barangay/evacuation-centers');
    const next = Array.isArray(data) ? data : [];
    setCenters(next);
    setCenterId((current) => next.some((center) => center.id === current) ? current : next[0]?.id ?? null);
  }, []);

  const loadCases = useCallback(async (id: number) => {
    const { data } = await api.get<CasesPayload>(`/barangay/evacuation-centers/${id}/cases`);
    setCases({
      incoming: Array.isArray(data.incoming) ? data.incoming : [],
      outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
      current: Array.isArray(data.current) ? data.current : [],
      resolved: Array.isArray(data.resolved) ? data.resolved : [],
    });
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      await loadCenters();
      setError('');
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to load evacuation centers.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [loadCenters, onAuthError]);

  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => {
    if (!centerId) { setCases({ incoming: [], outgoing: [], current: [], resolved: [] }); return undefined; }
    void loadCases(centerId).catch(() => setError('Failed to load evacuation-center cases.'));
    const timer = window.setInterval(() => {
      void Promise.all([loadCases(centerId), loadCenters()]).catch(() => {});
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [centerId, loadCases, loadCenters]);
  useEffect(() => {
    if (selectedCenter && !isManualCountDirty) setManualCount(String(selectedCenter.current_count));
  }, [selectedCenter, isManualCountDirty]);

  async function mutate(path: string, success: string, reportId: number, targetCenterId = centerId) {
    if (!targetCenterId || busyId) return;
    setBusyId(reportId); setError(''); setNotice('');
    try {
      await api.patch(`/barangay/evacuation-centers/${targetCenterId}/cases/${reportId}/${path}`);
      await Promise.all([centerId ? loadCases(centerId) : Promise.resolve(), loadCenters()]);
      setNotice(success);
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Unable to update the evacuee record.');
    } finally { setBusyId(null); }
  }

  async function saveCount() {
    if (!centerId || savingCount) return;
    const count = Number(manualCount);
    if (!Number.isInteger(count) || count < 0) { setError('Enter a non-negative whole number.'); return; }
    if (selectedCenter && count > selectedCenter.capacity) {
      setError(`Current count cannot exceed the center capacity of ${selectedCenter.capacity}.`);
      return;
    }
    setSavingCount(true); setError(''); setNotice('');
    try {
      const { data } = await api.patch<Pick<Center, 'id' | 'capacity' | 'current_count' | 'remaining_capacity'>>(`/barangay/evacuation-centers/${centerId}/count`, { count });
      setCenters((current) => current.map((center) => center.id === data.id ? { ...center, ...data } : center));
      setManualCount(String(data.current_count));
      setIsManualCountDirty(false);
      await loadCenters();
      setNotice('Current evacuee count updated.');
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to update the current count.');
    } finally { setSavingCount(false); }
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const tabCases = tab === 'incoming' ? cases.incoming : tab === 'outgoing' ? cases.outgoing : cases.resolved;
    return tabCases.filter((item) => !needle || String(item.resident_name || '').toLowerCase().includes(needle));
  }, [cases.incoming, cases.outgoing, cases.resolved, search, tab]);

  const emptyText = tab === 'incoming'
    ? 'No incoming cases awaiting confirmation.'
    : tab === 'outgoing' ? 'No departures awaiting confirmation.' : 'No completed rescue reports found.';

  return (
    <BarangayShell activeView="evacuation-center" title="Evacuation Center" subtitle={`Manage evacuation operations for Barangay ${barangayName}`}
      barangayName={barangayName} onLogout={onLogout} onOpenDashboard={onOpenDashboard} onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring} onOpenEvacuationCenter={() => {}} onOpenAccount={onOpenAccount}>
      <div className="space-y-4 bg-[#eaf3fb] p-4 sm:p-5">
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}

        <label className="block max-w-md text-sm font-bold text-slate-800">Evacuation center for capacity and manual count
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium" value={centerId ?? ''} onChange={(event) => { setIsManualCountDirty(false); setCenterId(Number(event.target.value)); }}>
            {centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
          </select>
        </label>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ['Current Evacuees', selectedCenter?.current_count ?? 0, 'text-[#173750]'],
            ['Center Capacity', selectedCenter?.capacity ?? 0, 'text-[#173750]'],
            ['Remaining Capacity', selectedCenter?.remaining_capacity ?? 0, 'text-emerald-600'],
          ].map(([label, value, color]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-3xl font-black ${color}`}>{value}</p></article>)}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-800">Manual current count</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input type="number" min="0" max={selectedCenter?.capacity} step="1" className="w-48 rounded-lg border border-slate-300 px-3 py-2" value={manualCount} onChange={(event) => { setManualCount(event.target.value); setIsManualCountDirty(true); }} />
            <button type="button" onClick={() => void saveCount()} disabled={!centerId || savingCount} className="rounded-lg bg-[#1f567d] px-5 py-2 font-bold text-white hover:bg-[#174866] disabled:opacity-50">{savingCount ? 'Saving…' : 'Save Current Count'}</button>
            <span className="text-xs text-slate-500">Arrival and departure confirmations adjust this count automatically.</span>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 border-b border-slate-300 pb-2">
          {([['incoming', 'Incoming'], ['resolved', 'Resolved'], ['outgoing', 'Outgoing']] as Array<[Tab, string]>).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-5 py-2 text-sm font-black ${tab === key ? 'bg-[#143d5b] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>{label}{key === 'incoming' && cases.incoming.length ? ` (${cases.incoming.length})` : key === 'outgoing' && cases.outgoing.length ? ` (${cases.outgoing.length})` : ''}</button>
          ))}
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-black text-[#173750]">{tab === 'incoming' ? 'Awaiting Arrival Confirmation' : tab === 'outgoing' ? 'Awaiting Departure Confirmation' : 'Completed Rescue Reports'}</h2><p className="text-sm text-slate-500">{tab === 'incoming' ? `Automatically showing incoming arrivals across Barangay ${barangayName}. Confirm only after physically verifying the evacuee.` : tab === 'outgoing' ? `Automatically showing pending departures across Barangay ${barangayName}. Confirm after the evacuee has left the center.` : `Automatically showing resolved evacuation records across Barangay ${barangayName}.`}</p></div>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search individual by name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-3 py-3">Individual</th><th className="px-3 py-3">Incident</th><th className="px-3 py-3">Barangay</th><th className="px-3 py-3">Evacuation Center</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Action</th></tr></thead>
              <tbody>
                {rows.map((item) => <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-3 py-3"><p className="font-bold text-slate-900">{item.resident_name || 'Unnamed resident'}</p><p className="text-xs text-slate-500">{item.contact_number || 'No contact'}</p></td>
                  <td className="px-3 py-3"><p className="font-mono text-xs font-bold">{item.report_code}</p><p className="text-xs text-slate-500">{item.incident_type.replace(/_/g, ' ')}</p></td>
                  <td className="px-3 py-3">{item.evacuation_area_barangay || barangayName}</td><td className="px-3 py-3">{item.evacuation_area_name || selectedCenter?.name}</td>
                  <td className="px-3 py-3 text-xs">{formatDate(tab === 'incoming' ? item.picked_up_at : tab === 'outgoing' ? item.departure_requested_at : item.evacuation_arrived_at)}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{tab === 'incoming' ? 'Transporting' : tab === 'outgoing' ? 'Leaving' : item.departure_confirmed_at ? 'Departed' : 'Inside Center'}</span></td>
                  <td className="px-3 py-3">{tab === 'incoming'
                    ? <button disabled={busyId === item.id} onClick={() => void mutate('arrival', 'Arrival confirmed.', item.id, item.evacuation_area_id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Confirm Arrival</button>
                    : tab === 'outgoing' ? <button disabled={busyId === item.id} onClick={() => void mutate('departure', 'Departure confirmed.', item.id, item.evacuation_area_id)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Confirm Departure</button>
                      : !item.departure_requested_at && !item.departure_confirmed_at ? <button disabled={busyId === item.id} onClick={() => void mutate('departure-request', 'Departure recorded.', item.id, item.evacuation_area_id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Record Departure</button> : <span className="text-xs text-slate-500">{item.departure_confirmed_at ? 'Completed' : 'Awaiting confirmation'}</span>}
                  </td>
                </tr>)}
                {!rows.length ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">{loading ? 'Loading evacuation-center data…' : emptyText}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </BarangayShell>
  );
}
