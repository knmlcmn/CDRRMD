import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

type BoundaryGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

type BoundaryProperties = {
  barangay?: string;
  riskLevel?: string;
};

type BoundaryFeature = GeoJSON.Feature<BoundaryGeometry, BoundaryProperties>;
type BoundaryCollection = GeoJSON.FeatureCollection<BoundaryGeometry, BoundaryProperties>;

type Props = {
  boundaries: BoundaryCollection;
  className?: string;
  center?: [number, number];
  zoom?: number;
  getRiskLevel?: (feature: BoundaryFeature) => string | null | undefined;
};

const RISK_COLORS: Record<RiskLevel, string> = {
  HIGH: '#dc2626',
  MEDIUM: '#f97316',
  LOW: '#16a34a',
};

function normalizeRiskLevel(value?: string | null): RiskLevel {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'HIGH') {
    return 'HIGH';
  }
  if (normalized === 'MEDIUM') {
    return 'MEDIUM';
  }
  return 'LOW';
}

export default function BarangayBoundaryMap({
  boundaries,
  className,
  center = [14.206021, 121.1556496],
  zoom = 12,
  getRiskLevel,
}: Props) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON<BoundaryProperties, BoundaryGeometry> | null>(null);

  const styleResolver = useMemo(() => {
    return (feature?: BoundaryFeature): L.PathOptions => {
      const riskRaw = feature
        ? (getRiskLevel ? getRiskLevel(feature) : feature.properties?.riskLevel)
        : null;
      const risk = normalizeRiskLevel(riskRaw);

      return {
        color: RISK_COLORS[risk],
        weight: 3,
        opacity: 1,
        fill: false,
        fillOpacity: 0,
      };
    };
  }, [getRiskLevel]);

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapHostRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map);

    const boundaryLayer = L.geoJSON<BoundaryProperties, BoundaryGeometry>(undefined, {
      style: (feature) => styleResolver(feature as BoundaryFeature | undefined),
      onEachFeature: (feature, layer) => {
        const barangay = feature.properties?.barangay || 'Barangay';
        const risk = normalizeRiskLevel(feature.properties?.riskLevel);
        layer.bindTooltip(`${barangay} (${risk})`, { sticky: true });
      },
    });

    boundaryLayer.addTo(map);
    mapRef.current = map;
    boundaryLayerRef.current = boundaryLayer;

    return () => {
      boundaryLayer.remove();
      map.remove();
      boundaryLayerRef.current = null;
      mapRef.current = null;
    };
  }, [center, styleResolver, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const boundaryLayer = boundaryLayerRef.current;
    if (!map || !boundaryLayer) {
      return;
    }

    boundaryLayer.clearLayers();
    boundaryLayer.addData(boundaries);
    boundaryLayer.setStyle((feature) => styleResolver(feature as BoundaryFeature | undefined));

    const bounds = boundaryLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.08), { maxZoom: 15 });
    }
  }, [boundaries, styleResolver]);

  return <div ref={mapHostRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
