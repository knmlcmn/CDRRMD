import L from 'leaflet';

export type StandardMapMarkerKind = 'resident' | 'barangay' | 'cddrmd' | 'evacuation';

export function standardMapMarkerIcon(kind: StandardMapMarkerKind, selected = false) {
  const markers = {
    resident: { color: '#dc2626', icon: 'bxs-user' },
    barangay: { color: '#2563eb', icon: 'bxs-shield' },
    cddrmd: { color: '#ea580c', icon: 'bxs-ambulance' },
    evacuation: { color: '#e11d48', icon: 'bxs-ambulance' },
  } as const;
  const marker = markers[kind];
  const size = selected ? 34 : 26;

  return L.divIcon({
    className: '',
    html: `<div style="align-items:center;background:${marker.color};border:3px solid #fff;border-radius:999px;box-shadow:${selected ? `0 0 0 4px ${marker.color}55,` : ''} 0 3px 9px rgba(15,23,42,.38);display:flex;height:${size}px;justify-content:center;width:${size}px"><img alt="" src="https://unpkg.com/boxicons@2.1.4/svg/solid/${marker.icon}.svg" style="filter:brightness(0) invert(1);height:${Math.round(size * 0.62)}px;width:${Math.round(size * 0.62)}px" /></div>`,
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
    popupAnchor: [0, -(size / 2)],
  });
}
