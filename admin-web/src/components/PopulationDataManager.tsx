import { useCallback, useEffect, useState } from 'react';
import { d } from '../adminDesign';
import { api } from '../services/apiClient';
import { useConfirmationDialog } from './ConfirmationDialog';
import './PopulationDataManager.css';

export type PopulationRecord = {
  barangay: string;
  population: number;
  households: number;
  landAreaHectares: number;
  densityPersonsPerSquareKilometer: number;
  densityClassification: string;
  populationYear: number;
  dataSource: string;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onAuthError: () => void;
  onUpdated: () => void;
};

type FormState = {
  population: string;
  households: string;
  dataYear: string;
  dataSource: string;
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits });
}

function formFor(record: PopulationRecord): FormState {
  return {
    population: String(record.population),
    households: String(record.households),
    dataYear: String(record.populationYear),
    dataSource: record.dataSource,
  };
}

function densityClassification(value: number) {
  if (value >= 30000) return 'Very High';
  if (value >= 20000) return 'High';
  if (value >= 15000) return 'Elevated';
  if (value >= 10000) return 'Moderate';
  return 'Low';
}

export default function PopulationDataManager({ open, onClose, onAuthError, onUpdated }: Props) {
  const [records, setRecords] = useState<PopulationRecord[]>([]);
  const [editing, setEditing] = useState<PopulationRecord | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { confirm, confirmationDialog } = useConfirmationDialog();

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<{ records?: PopulationRecord[] }>('/gis/population-density/manage');
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) return onAuthError();
      setError(apiError.response?.data?.message || 'Unable to load population data.');
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    if (open) void loadRecords();
  }, [loadRecords, open]);

  if (!open) return null;

  const previewPopulation = Number(form?.population);
  const previewDensity = editing && Number.isFinite(previewPopulation) && previewPopulation >= 0
    ? previewPopulation / (editing.landAreaHectares / 100)
    : editing?.densityPersonsPerSquareKilometer ?? 0;

  function startEditing(record: PopulationRecord) {
    setEditing(record);
    setForm(formFor(record));
    setError('');
    setSuccess('');
  }

  function cancelEditing() {
    if (saving) return;
    setEditing(null);
    setForm(null);
    setError('');
  }

  function validateForm(value: FormState) {
    const population = Number(value.population);
    const households = Number(value.households);
    const dataYear = Number(value.dataYear);
    const currentYear = new Date().getFullYear();
    if (!Number.isSafeInteger(population) || population < 0) return 'Population must be a non-negative whole number.';
    if (!Number.isSafeInteger(households) || households < 0) return 'Households must be a non-negative whole number.';
    if (households > population) return 'Households must not exceed the population count.';
    if (!Number.isInteger(dataYear) || dataYear < 1900 || dataYear > currentYear) return `Data year must be between 1900 and ${currentYear}.`;
    if (!value.dataSource.trim()) return 'Data source is required.';
    if (value.dataSource.trim().length > 500) return 'Data source must not exceed 500 characters.';
    return '';
  }

  async function saveChanges() {
    if (!editing || !form) return;
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    const approved = await confirm({
      title: 'Save population data?',
      message: `Update ${editing.barangay} to ${formatNumber(Number(form.population))} people and ${formatNumber(Number(form.households))} households? The GIS density and classification will recalculate automatically.`,
      confirmLabel: 'Save Changes',
    });
    if (!approved) return;

    setSaving(true);
    setError('');
    try {
      const { data } = await api.put<{ message?: string; record: PopulationRecord }>(
        `/gis/population-density/${encodeURIComponent(editing.barangay)}`,
        {
          population: Number(form.population),
          households: Number(form.households),
          dataYear: Number(form.dataYear),
          dataSource: form.dataSource.trim(),
        },
      );
      setRecords((current) => current.map((record) => record.barangay === data.record.barangay ? data.record : record));
      setEditing(null);
      setForm(null);
      setSuccess(data.message || 'Population data saved successfully.');
      onUpdated();
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) return onAuthError();
      setError(apiError.response?.data?.message || 'Population data was not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="population-manager-overlay" role="dialog" aria-modal="true" aria-labelledby="population-manager-title">
      <section className="population-manager-card">
        <header className="population-manager-header">
          <div>
            <p className="population-manager-eyebrow">GIS Mapping</p>
            <h2 id="population-manager-title">Population Data</h2>
            <p>Manage the current population record used by every portal map.</p>
          </div>
          <button type="button" className={d.btn.secondary} onClick={onClose} disabled={saving}>Close</button>
        </header>

        {error && !editing ? <div className="population-manager-feedback is-error" role="alert">{error}</div> : null}
        {success ? <div className="population-manager-feedback is-success" role="status">{success}</div> : null}

        <div className="population-manager-table-wrap">
          <table className="population-manager-table">
            <thead><tr><th>Barangay</th><th>Population</th><th>Households</th><th>Land area</th><th>Density</th><th>Classification</th><th>Data year</th><th>Data source</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="population-manager-empty">Loading population data...</td></tr> : null}
              {!loading && records.length === 0 ? <tr><td colSpan={9} className="population-manager-empty">No population records are available.</td></tr> : null}
              {!loading ? records.map((record) => (
                <tr key={record.barangay}>
                  <td className="population-manager-name">{record.barangay}</td>
                  <td>{formatNumber(record.population)}</td>
                  <td>{formatNumber(record.households)}</td>
                  <td>{formatNumber(record.landAreaHectares, 2)} ha</td>
                  <td>{formatNumber(record.densityPersonsPerSquareKilometer, 2)} people/km²</td>
                  <td><span className={`population-density-chip density-${record.densityClassification.toLowerCase().replace(/\s+/g, '-')}`}>{record.densityClassification}</span></td>
                  <td>{record.populationYear}</td>
                  <td className="population-manager-source" title={record.dataSource}>{record.dataSource}</td>
                  <td><button type="button" className={d.btn.secondaryXs} onClick={() => startEditing(record)}>Edit</button></td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        <p className="population-manager-note">Barangay name, land area, density, and classification are read-only. Density uses population divided by land area in km²; household changes do not affect it.</p>
      </section>

      {editing && form ? (
        <div className="population-edit-overlay" role="dialog" aria-modal="true" aria-labelledby="population-edit-title">
          <form className="population-edit-card" onSubmit={(event) => { event.preventDefault(); void saveChanges(); }}>
            <header><p className="population-manager-eyebrow">Edit Population Data</p><h3 id="population-edit-title">{editing.barangay}</h3></header>
            {error ? <div className="population-manager-feedback is-error" role="alert">{error}</div> : null}
            <div className="population-edit-grid">
              <label>Population<input type="number" min="0" step="1" required value={form.population} onChange={(event) => setForm({ ...form, population: event.target.value })} /></label>
              <label>Households<input type="number" min="0" step="1" required value={form.households} onChange={(event) => setForm({ ...form, households: event.target.value })} /></label>
              <label>Data year<input type="number" min="1900" max={new Date().getFullYear()} step="1" required value={form.dataYear} onChange={(event) => setForm({ ...form, dataYear: event.target.value })} /></label>
              <label className="population-edit-source">Data source<textarea required maxLength={500} rows={3} value={form.dataSource} onChange={(event) => setForm({ ...form, dataSource: event.target.value })} /></label>
              <div className="population-edit-readonly"><span>Land area</span><strong>{formatNumber(editing.landAreaHectares, 2)} ha</strong></div>
              <div className="population-edit-readonly"><span>Calculated density</span><strong>{formatNumber(previewDensity, 2)} people/km² · {densityClassification(previewDensity)}</strong></div>
            </div>
            <footer><button type="button" className={d.btn.secondary} onClick={cancelEditing} disabled={saving}>Cancel</button><button type="submit" className={d.btn.primary} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button></footer>
          </form>
        </div>
      ) : null}
      {confirmationDialog}
    </div>
  );
}
