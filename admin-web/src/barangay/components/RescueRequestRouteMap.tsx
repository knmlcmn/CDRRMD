import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoadRoute, type RoadCoordinate } from '../../services/roadRouting';
import { standardMapMarkerIcon } from '../../utils/standardMapMarker';

type RouteMetrics = { distanceKm: number; etaMinutes: number };

type Props = {
  resident: RoadCoordinate;
  evacuationArea: RoadCoordinate;
  rescuer?: RoadCoordinate | null;
  responderKind: 'barangay' | 'cddrmd';
  residentName: string;
  evacuationAreaName: string;
  rescuerName?: string;
  onRouteMetrics: (metrics: RouteMetrics | null) => void;
};

export type RescueRequestRouteMapHandle = {
  focusResident: () => void;
  focusRescuer: () => void;
};

const RescueRequestRouteMap = forwardRef<RescueRequestRouteMapHandle, Props>(function RescueRequestRouteMap({
  resident,
  evacuationArea,
  rescuer,
  responderKind,
  residentName,
  evacuationAreaName,
  rescuerName = 'Assigned rescuer',
  onRouteMetrics,
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const residentMarkerRef = useRef<L.Marker | null>(null);
  const rescuerMarkerRef = useRef<L.Marker | null>(null);
  const selectedMarkerRef = useRef<'resident' | 'rescuer' | null>(null);
  const [message, setMessage] = useState('Loading shortest route…');
  const rescuerLatitude = rescuer?.latitude;
  const rescuerLongitude = rescuer?.longitude;
  const hasRescuerLocation = rescuerLatitude != null && rescuerLongitude != null;

  useImperativeHandle(ref, () => ({
    focusResident: () => {
      selectedMarkerRef.current = 'resident';
      const map = mapRef.current;
      const residentMarker = residentMarkerRef.current;
      const rescuerMarker = rescuerMarkerRef.current;
      if (map && rescuerMarker && map.hasLayer(rescuerMarker)) map.removeLayer(rescuerMarker);
      if (map && residentMarker && !map.hasLayer(residentMarker)) residentMarker.addTo(map);
      residentMarkerRef.current?.setIcon(standardMapMarkerIcon('resident', true));
      rescuerMarkerRef.current?.setIcon(standardMapMarkerIcon(responderKind));
      map?.flyTo([resident.latitude, resident.longitude], 18, { duration: 0.6 });
    },
    focusRescuer: () => {
      if (rescuerLatitude != null && rescuerLongitude != null) {
        selectedMarkerRef.current = 'rescuer';
        const map = mapRef.current;
        const residentMarker = residentMarkerRef.current;
        const rescuerMarker = rescuerMarkerRef.current;
        if (map && residentMarker && map.hasLayer(residentMarker)) map.removeLayer(residentMarker);
        if (map && rescuerMarker && !map.hasLayer(rescuerMarker)) rescuerMarker.addTo(map);
        residentMarkerRef.current?.setIcon(standardMapMarkerIcon('resident'));
        rescuerMarkerRef.current?.setIcon(standardMapMarkerIcon(responderKind, true));
        map?.flyTo([rescuerLatitude, rescuerLongitude], 18, { duration: 0.6 });
      }
    },
  }), [rescuerLatitude, rescuerLongitude, resident.latitude, resident.longitude, responderKind]);

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
    residentMarkerRef.current = L.marker(residentPoint, { icon: standardMapMarkerIcon('resident'), zIndexOffset: 1200 })
      .addTo(map)
      .bindTooltip(residentName, { direction: 'top' });
    L.marker(evacuationPoint, { icon: standardMapMarkerIcon('evacuation'), zIndexOffset: 1100 })
      .addTo(map)
      .bindTooltip(evacuationAreaName, { direction: 'top' });
    if (rescuerLatitude != null && rescuerLongitude != null) {
      rescuerMarkerRef.current = L.marker([rescuerLatitude, rescuerLongitude], { icon: standardMapMarkerIcon(responderKind), zIndexOffset: 1300 })
        .bindTooltip(rescuerName, { direction: 'top' });
    }

    const directBounds = L.latLngBounds([residentPoint, evacuationPoint]);
    map.fitBounds(directBounds, { maxZoom: 16, padding: [34, 34] });

    void fetchRoadRoute(
      { latitude: resident.latitude, longitude: resident.longitude },
      { latitude: evacuationArea.latitude, longitude: evacuationArea.longitude },
    )
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
        if (selectedMarkerRef.current === 'resident') {
          map.flyTo(residentPoint, 18, { duration: 0.6 });
        } else if (selectedMarkerRef.current === 'rescuer' && rescuerLatitude != null && rescuerLongitude != null) {
          map.flyTo([rescuerLatitude, rescuerLongitude], 18, { duration: 0.6 });
        } else {
          map.fitBounds(routeBounds, {
            maxZoom: 16,
            paddingTopLeft: [36, 38],
            paddingBottomRight: [36, 38],
          });
        }
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
      residentMarkerRef.current = null;
      rescuerMarkerRef.current = null;
      selectedMarkerRef.current = null;
    };
  }, [evacuationArea.latitude, evacuationArea.longitude, evacuationAreaName, hasRescuerLocation, onRouteMetrics, rescuerLatitude, rescuerLongitude, rescuerName, resident.latitude, resident.longitude, residentName, responderKind]);

  return (
    <div className="rescue-request-route-map" aria-label={`Route from ${residentName} to ${evacuationAreaName}`}>
      <div ref={hostRef} className="rescue-request-route-map-canvas" />
      {message ? <span className="rescue-request-route-map-status">{message}</span> : null}
    </div>
  );
});

export default RescueRequestRouteMap;
