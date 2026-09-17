import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type { EvacuationAreaItem } from '../types';

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenPostUpdates: () => void;
};

type DetailForm = {
  id: number;
  name: string;
  barangay: string;
  placeType: string;
  address: string;
  capacity: string;
  evacuees: string;
  latitude: string;
  longitude: string;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    neighbourhood?: string;
    quarter?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    county?: string;
    state?: string;
  };
};

const CALAMBA_CENTER = { latitude: 14.206021, longitude: 121.1556496 };

function toForm(area: EvacuationAreaItem): DetailForm {
  return {
    id: area.id,
    name: area.name,
    barangay: area.barangay,
    placeType: area.place_type || '',
    address: area.address || '',
    capacity: String(area.capacity ?? 0),
    evacuees: String(area.evacuees ?? 0),
    latitude: String(area.latitude),
    longitude: String(area.longitude),
  };
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function buildMapHtml(areas: EvacuationAreaItem[], selectedId: number | null, previewPin?: { lat: number; lng: number } | null) {
  const payload = JSON.stringify({ areas, selectedId, previewPin: previewPin ?? null });
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
    <style>
      html, body, #map { margin: 0; width: 100%; height: 100%; }
      .pin {
        align-items: center;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: #e11d48;
        border: 3px solid #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,.35);
        display: flex;
        justify-content: center;
      }
      .pin img { filter: brightness(0) invert(1); height: 12px; width: 12px; }
      .pin.selected {
        background: #14b8a6;
        width: 18px;
        height: 18px;
      }
      .pin.preview {
        background: #f59e0b;
        width: 18px;
        height: 18px;
        border: 3px solid #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,.5);
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      var data = ${payload};
      var map = L.map('map', { zoomControl: true }).setView([${CALAMBA_CENTER.latitude}, ${CALAMBA_CENTER.longitude}], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      var cdrrmdIcon = L.divIcon({
        className: '',
        html: '<div style="align-items:center;background:#16a34a;border:3px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 3px 9px rgba(0,0,0,.45);display:flex;height:25px;justify-content:center;transform:rotate(-45deg);width:25px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-landmark.svg" style="filter:brightness(0) invert(1);height:15px;transform:rotate(45deg);width:15px" /></div>',
        iconSize: [31, 31],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28]
      });
      L.marker([14.194052, 121.159688], { icon: cdrrmdIcon, zIndexOffset: 1200 })
        .addTo(map)
        .bindTooltip('CDRRMD - Calamba City Hall', { direction: 'top', offset: [0, -25] })
        .bindPopup('<strong>CDRRMD</strong><br>Calamba City Hall<br>14.194052, 121.159688');

      var markers = [];
      data.areas.forEach(function(area) {
        var isSelected = Number(area.id) === Number(data.selectedId);
        var icon = L.divIcon({
          className: '',
          html: '<div class="pin' + (isSelected ? ' selected' : '') + '"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-ambulance.svg" /></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        var marker = L.marker([area.latitude, area.longitude], { icon: icon }).addTo(map);
        marker.on('click', function() {
          window.parent.postMessage({ type: 'evac-select', id: area.id }, '*');
        });
        markers.push(marker);
      });

      if (data.previewPin) {
        var previewIcon = L.divIcon({
          className: '',
          html: '<div class="pin preview"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/bxs-ambulance.svg" /></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        var previewMarker = L.marker([data.previewPin.lat, data.previewPin.lng], { icon: previewIcon }).addTo(map);
        map.setView([data.previewPin.lat, data.previewPin.lng], 16);
        markers.push(previewMarker);
      } else if (markers.length > 0) {
        var bounds = L.latLngBounds(markers.map(function(marker){ return marker.getLatLng(); }));
        map.fitBounds(bounds.pad(0.15), { maxZoom: 15 });
      }
    </script>
  </body>
</html>`;
}

export default function EvacuationAreasPage({ onLogout, onOpenDashboard, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenMonitoring, onOpenFloodMonitoring, onOpenPostUpdates }: Props) {
  const [areas, setAreas] = useState<EvacuationAreaItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<DetailForm | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OSM address search
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [previewPin, setPreviewPin] = useState<{ lat: number; lng: number } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/content/evacuation-areas');
      const nextAreas = data as EvacuationAreaItem[];
      setAreas(nextAreas);

      if (nextAreas.length === 0) {
        setSelectedId(null);
        setForm(null);
      } else {
        const activeId = selectedId && nextAreas.some((area) => area.id === selectedId) ? selectedId : nextAreas[0].id;
        setSelectedId(activeId);
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Failed to load evacuation areas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (isCreating) {
      return;
    }

    if (!selectedId) {
      setForm(null);
      return;
    }

    const area = areas.find((item) => item.id === selectedId);
    if (!area) {
      setForm(null);
      return;
    }

    setForm(toForm(area));
    setIsEditing(false);
  }, [areas, selectedId, isCreating]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const payload = event.data;
      if (!payload || payload.type !== 'evac-select') {
        return;
      }
      const id = Number(payload.id);
      if (!Number.isFinite(id)) {
        return;
      }
      setSelectedId(id);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function onAddressChange(value: string) {
    setForm((prev) => (prev ? { ...prev, address: value } : prev));
    setShowDropdown(false);
    setSearchResults([]);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (value.trim().length < 3) {
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const query = encodeURIComponent(`${value}, Calamba, Laguna, Philippines`);
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=6&countrycodes=ph`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'en', 'User-Agent': 'CDRRMD-App/1.0' },
        });
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
        setShowDropdown(data.length > 0);
      } catch {
        // Silently fail — admin can still type manually
      } finally {
        setSearchLoading(false);
      }
    }, 500);
  }

  function onSelectSearchResult(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const barangay =
      result.address?.quarter ||
      result.address?.suburb ||
      result.address?.neighbourhood ||
      result.address?.village ||
      '';

    setForm((prev) =>
      prev
        ? {
            ...prev,
            address: result.display_name,
            latitude: String(lat),
            longitude: String(lng),
            barangay: prev.barangay || barangay,
          }
        : prev,
    );
    setPreviewPin({ lat, lng });
    setShowDropdown(false);
    setSearchResults([]);
  }

  async function onAddPin() {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedId(null);
    setError(null);
    setForm({
      id: -1,
      name: '',
      barangay: '',
      placeType: '',
      address: '',
      capacity: '',
      evacuees: '0',
      latitude: String(CALAMBA_CENTER.latitude),
      longitude: String(CALAMBA_CENTER.longitude),
    });
  }

  function onEditDetails() {
    if (!form) {
      return;
    }
    setIsEditing(true);
    setError(null);
  }

  function onCancelEdit() {
    setError(null);

    if (isCreating) {
      setIsCreating(false);
      setIsEditing(false);
      const fallbackId = areas[0]?.id ?? null;
      setSelectedId(fallbackId);
      return;
    }

    if (selectedId) {
      const selectedArea = areas.find((item) => item.id === selectedId);
      if (selectedArea) {
        setForm(toForm(selectedArea));
      }
    }

    setIsEditing(false);
    setPreviewPin(null);
  }

  async function onSaveDetails() {
    if (!form) {
      return;
    }

    if (!isEditing) {
      return;
    }

    const requiredTextFields = [form.name, form.barangay, form.placeType, form.address].map((item) => item.trim());
    if (requiredTextFields.some((item) => !item)) {
      setError('Please fill in all evacuation details before saving.');
      return;
    }

    const capacity = Number(form.capacity);
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('Capacity must be a valid number and a location must be selected from the address search.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isCreating) {
        const { data } = await api.post('/content/evacuation-areas', {
          name: form.name,
          barangay: form.barangay,
          placeType: form.placeType,
          address: form.address,
          capacity,
          evacuees: 0,
          latitude,
          longitude,
          isActive: true,
        });

        const created = data as EvacuationAreaItem;
        await reload();
        setSelectedId(created.id);
        setIsCreating(false);
        setIsEditing(false);
        setPreviewPin(null);
      } else {
        await api.put(`/content/evacuation-areas/${form.id}`, {
          name: form.name,
          barangay: form.barangay,
          placeType: form.placeType,
          address: form.address,
          capacity,
          evacuees: areas.find((item) => item.id === form.id)?.evacuees ?? 0,
          latitude,
          longitude,
          isActive: true,
        });
        await reload();
        setSelectedId(form.id);
        setIsEditing(false);
        setPreviewPin(null);
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || (isCreating ? 'Failed to create evacuation pin.' : 'Failed to update evacuation pin.'));
    } finally {
      setSaving(false);
    }
  }

  async function onDeletePin() {
    if (!form || isCreating) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.delete(`/content/evacuation-areas/${form.id}`);
      await reload();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Failed to delete evacuation pin.');
    } finally {
      setSaving(false);
    }
  }

  const mapHtml = useMemo(() => buildMapHtml(areas, selectedId, previewPin), [areas, selectedId, previewPin]);

  const otherAreas = useMemo<Array<EvacuationAreaItem & { distanceKm: number }>>(() => {
    const origin = form
      ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
      : CALAMBA_CENTER;

    return areas
      .filter((item) => (form ? item.id !== form.id : true))
      .map((item) => ({
        ...item,
        distanceKm: haversineKm(origin, { latitude: item.latitude, longitude: item.longitude }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [areas, form]);

  return (
    <AdminShell
      activeView="evacuation"
      title="Evacuation Area Planning"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={onOpenAdmin}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={() => {}}
      onOpenPostUpdates={onOpenPostUpdates}
      actions={
        <button onClick={onAddPin} disabled={saving} className={d.evac.actionAdd}>
          Add Evacuation Area Pin
        </button>
      }
    >
      <div className={d.evac.root}>

        {error ? <div className={d.page.error}>{error}</div> : null}

            <div className={d.evac.grid}>
              <section className={d.evac.mapSection}>
                <h2 className={d.evac.mapTitle}>Evacuation Areas</h2>
                <div className={d.evac.mapWrap}>
                  <iframe title="Evacuation area map" srcDoc={mapHtml} className={d.evac.mapFrame} />
                </div>
              </section>

              <section className={d.evac.detailSection}>
                <h2 className={d.evac.detailTitle}>Evacuation Details</h2>

                <div className={d.evac.detailBody}>
                  <p className={d.evac.detailLabel}>Selected Pin Details</p>

                  <div className={d.evac.formStack}>
                    <input
                      value={form?.name || ''}
                      onChange={(e) => setForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                      placeholder="Name"
                      disabled={!isEditing}
                      className={isEditing ? d.form.inputSm : d.form.inputSmDisabled}
                    />
                    <div className={d.evac.twoCol}>
                      <input
                        value={form?.barangay || ''}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, barangay: e.target.value } : prev))}
                        placeholder="Barangay"
                        disabled={!isEditing}
                        className={isEditing ? d.form.inputSm : d.form.inputSmDisabled}
                      />
                      <input
                        value={form?.placeType || ''}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, placeType: e.target.value } : prev))}
                        placeholder="Place Type"
                        disabled={!isEditing}
                        className={isEditing ? d.form.inputSm : d.form.inputSmDisabled}
                      />
                    </div>
                    <div className="relative" ref={dropdownRef}>
                      <div className="relative">
                        <input
                          value={form?.address || ''}
                          onChange={(e) => isEditing ? onAddressChange(e.target.value) : undefined}
                          placeholder={isEditing ? 'Type address to search…' : 'Address'}
                          disabled={!isEditing}
                          className={isEditing ? d.form.inputSm : d.form.inputSmDisabled}
                          autoComplete="off"
                        />
                        {isEditing && searchLoading && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                            Searching…
                          </span>
                        )}
                      </div>
                      {isEditing && showDropdown && searchResults.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-300 bg-white shadow-lg max-h-52 overflow-y-auto">
                          {searchResults.map((result) => (
                            <button
                              key={result.place_id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); onSelectSearchResult(result); }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 border-b border-slate-100 last:border-0"
                            >
                              <span className="font-semibold text-[#12314b] block truncate">{result.display_name}</span>
                              <span className="text-slate-400">{parseFloat(result.lat).toFixed(6)}, {parseFloat(result.lon).toFixed(6)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isEditing && form?.latitude && form?.longitude && parseFloat(form.latitude) !== CALAMBA_CENTER.latitude ? (
                      <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 flex items-center gap-2">
                        <span>📍</span>
                        <span>
                          <span className="font-semibold">Location set:</span> {parseFloat(form.latitude).toFixed(6)}, {parseFloat(form.longitude).toFixed(6)}
                        </span>
                      </div>
                    ) : isEditing ? (
                      <p className="text-xs text-slate-400 px-1">Search an address above to pin the location on the map.</p>
                    ) : null}
                    <div className={d.evac.threeCol}>
                      <input
                        value={form?.capacity || ''}
                        onChange={(e) => setForm((prev) => (prev ? { ...prev, capacity: e.target.value } : prev))}
                        placeholder="Capacity"
                        disabled={!isEditing}
                        className={isEditing ? d.form.inputSm : d.form.inputSmDisabled}
                      />
                      <input
                        value={form?.evacuees || '0'}
                        placeholder="Evacuees"
                        disabled
                        className={d.form.inputSmDisabled}
                      />
                    </div>
                  </div>

                  {isEditing ? (
                    <div className={isCreating ? d.evac.formActions : d.evac.formActionsWide}>
                      <button
                        onClick={onSaveDetails}
                        disabled={!form || saving || loading}
                        className={d.btn.emeraldSm}
                      >
                        {isCreating ? 'Create Evacuation Area' : 'Save Changes'}
                      </button>
                      {!isCreating ? (
                        <button
                          onClick={onDeletePin}
                          disabled={!form || saving || loading}
                          className={d.btn.redSm}
                        >
                          Delete
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={onCancelEdit}
                        disabled={saving}
                        className={d.btn.neutral}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className={d.evac.editOnlyActions}>
                      <button
                        type="button"
                        onClick={onEditDetails}
                        disabled={!form || loading}
                        className={d.btn.warning}
                      >
                        Edit Details
                      </button>
                    </div>
                  )}
                </div>

                <div className={d.evac.otherWrap}>
                  <p className={d.evac.otherTitle}>Other Evacuation Areas</p>
                  <div className={d.evac.otherList}>
                    {otherAreas.map((area) => (
                      <button
                        key={area.id}
                        onClick={() => setSelectedId(area.id)}
                        className={d.evac.otherItem}
                      >
                        <p className={d.evac.otherName}>{area.name}</p>
                        <p className={d.evac.otherBarangay}>{area.barangay}</p>
                        <p className={d.evac.otherDistance}>{area.distanceKm.toFixed(2)} km away</p>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            {loading ? <p className={d.page.loading}>Loading evacuation data...</p> : null}
      </div>
    </AdminShell>
  );
}
