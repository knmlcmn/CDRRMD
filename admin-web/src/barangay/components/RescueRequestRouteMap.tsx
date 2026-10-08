import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoadRoute, type RoadCoordinate } from '../../services/roadRouting';

type RouteMetrics = { distanceKm: number; etaMinutes: number };

type Props = {
  resident: RoadCoordinate;
  evacuationArea: RoadCoordinate;
  residentName: string;
  evacuationAreaName: string;
  onRouteMetrics: (metrics: RouteMetrics | null) => void;
};

function markerIcon(color: string, symbol: string) {
  return L.divIcon({
    className: '',
    html: `<div class="rescue-route-pin" style="--pin-color:${color}"><span>${symbol}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 33],
    popupAnchor: [0, -30],
  });
}

export default function RescueRequestRouteMap({
  resident,
  evacuationArea,
  residentName,
  evacuationAreaName,
  onRouteMetrics,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [message, setMessage] = useState('Loading shortest route…');

  useEffect(() => {
    if (!hostRef.current) return;

    let cancelled = false;
    const map = L.map(hostRef.current, {
      attributionControl: false,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map);

    const residentPoint = L.latLng(resident.latitude, resident.longitude);
    const evacuationPoint = L.latLng(evacuationArea.latitude, evacuationArea.longitude);
    L.marker(residentPoint, { icon: markerIcon('#dc2626', '●'), zIndexOffset: 1200 })
      .addTo(map)
      .bindTooltip(residentName, { direction: 'top' });
    L.marker(evacuationPoint, { icon: markerIcon('#15803d', 'E'), zIndexOffset: 1100 })
      .addTo(map)
      .bindTooltip(evacuationAreaName, { direction: 'top' });

    const directBounds = L.latLngBounds([residentPoint, evacuationPoint]);
    map.fitBounds(directBounds, { maxZoom: 16, padding: [34, 34] });

    void fetchRoadRoute(resident, evacuationArea)
      .then((route) => {
        if (cancelled) return;
        const points = route.coordinates.map((point) => L.latLng(point.latitude, point.longitude));
        const routeLine = L.polyline(points, {
          color: '#2389ed',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        const routeBounds = routeLine.getBounds();
        routeBounds.extend(residentPoint);
        routeBounds.extend(evacuationPoint);
        map.fitBounds(routeBounds, {
          maxZoom: 16,
          paddingTopLeft: [36, 38],
          paddingBottomRight: [36, 38],
        });
        onRouteMetrics({ distanceKm: route.distanceKm, etaMinutes: route.etaMinutes });
        setMessage('');
        window.setTimeout(() => map.invalidateSize(), 80);
      })
      .catch(() => {
        if (cancelled) return;
        L.polyline([residentPoint, evacuationPoint], {
          color: '#2389ed',
          weight: 5,
          opacity: 0.8,
          dashArray: '8 7',
        }).addTo(map);
        onRouteMetrics(null);
        setMessage('Road route unavailable');
      });

    window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [evacuationArea.latitude, evacuationArea.longitude, evacuationAreaName, onRouteMetrics, resident.latitude, resident.longitude, residentName]);

  return (
    <div className="rescue-request-route-map" aria-label={`Route from ${residentName} to ${evacuationAreaName}`}>
      <div ref={hostRef} className="rescue-request-route-map-canvas" />
      {message ? <span className="rescue-request-route-map-status">{message}</span> : null}
    </div>
  );
}
