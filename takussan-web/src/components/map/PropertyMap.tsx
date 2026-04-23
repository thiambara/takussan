'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import {
  boundsToString,
  usePropertyMapQuery,
  type MapBounds,
  type PropertyMapFeature,
} from '@/lib/queries/properties';

/**
 * Interactive search-results map — Wave 3 / TCK-047.
 *
 * Uses Leaflet + react-leaflet (open source, no API key required).
 * Markers refetch whenever the user pans or zooms (bounds-driven query).
 *
 * The heavy Leaflet bundle is scoped to this single client component and
 * only loaded when the user toggles the map view on the `/properties` page.
 */

// Icon fallback: Leaflet's default icon can't locate its assets under Next's
// bundler, so we define lightweight pin icons inline using the bundled
// `leaflet/dist/images/*` via the Next.js public loader. To keep things
// portable and SSR-safe, we rely on inline SVG Data URIs instead.
const PIN_SVG = encodeURIComponent(
  `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 48" width="32" height="48">
    <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32C32 7.2 24.8 0 16 0z" fill="#0c4a6e"/>
    <circle cx="16" cy="16" r="6" fill="#ffffff"/>
  </svg>`,
);

const createPin = () =>
  L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${PIN_SVG}`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -40],
  });

// Default viewport — Dakar, Senegal.
const DEFAULT_CENTER: [number, number] = [14.6928, -17.4467];
const DEFAULT_ZOOM = 12;

export interface PropertyMapProps {
  readonly className?: string;
  readonly height?: string;
  /** Extra filters to forward to the map endpoint (type, contract_type, price). */
  readonly filters?: Record<string, string | number | undefined>;
  /** Called when a marker is clicked (useful for syncing with a side list). */
  readonly onMarkerClick?: (feature: PropertyMapFeature) => void;
}

function BoundsWatcher({
  onChange,
}: {
  onChange: (bounds: MapBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });

  // Emit once on mount.
  useEffect(() => {
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const b = map.getBounds();
    onChange({
      swLat: b.getSouthWest().lat,
      swLng: b.getSouthWest().lng,
      neLat: b.getNorthEast().lat,
      neLng: b.getNorthEast().lng,
    });
  }

  return null;
}

function FitToFeatures({ features }: { features: PropertyMapFeature[] }) {
  const map = useMap();
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current) return;
    if (features.length === 0) return;
    const latlngs = features.map<[number, number]>((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
    ]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    onceRef.current = true;
  }, [features, map]);

  return null;
}

export function PropertyMap({
  className = '',
  height = 'h-[520px]',
  filters = {},
  onMarkerClick,
}: PropertyMapProps) {
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const query = usePropertyMapQuery(bounds, filters);
  const pinIcon = useMemo(() => createPin(), []);

  const features = query.data?.features ?? [];

  return (
    <div className={`relative ${className}`}>
      <div className={`${height} w-full overflow-hidden rounded-xl border border-stone-200`}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
          // Re-mount cleanly: see https://react-leaflet.js.org/docs/start-introduction/
          key={boundsToString(bounds ?? { swLat: 0, swLng: 0, neLat: 0, neLng: 0 })}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundsWatcher onChange={setBounds} />
          <FitToFeatures features={features} />
          {features.map((feature) => (
            <Marker
              key={feature.properties.id}
              position={[
                feature.geometry.coordinates[1],
                feature.geometry.coordinates[0],
              ]}
              icon={pinIcon}
              eventHandlers={{
                click: () => onMarkerClick?.(feature),
              }}
            >
              <Popup>
                <MapPopupCard feature={feature} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {query.isFetching && (
        <div className="pointer-events-none absolute top-3 right-3 z-[400] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-600 shadow">
          Chargement…
        </div>
      )}
      {query.data?.meta.truncated && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 shadow">
          {query.data.meta.returned}+ biens — zoomez pour affiner
        </div>
      )}
    </div>
  );
}

function MapPopupCard({ feature }: { feature: PropertyMapFeature }) {
  const p = feature.properties;
  const isSale = p.contract_type === 'sale';
  return (
    <Link
      href={`/properties/${p.slug}`}
      className="block w-[220px] no-underline text-stone-900"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-md bg-stone-200">
        {p.thumbnail && (
          <Image
            src={p.thumbnail}
            alt={p.title}
            fill
            sizes="220px"
            className="object-cover"
          />
        )}
      </div>
      <div className="p-2">
        <p className="text-xs text-stone-500 mb-0.5">
          {isSale ? 'En vente' : 'En location'}
        </p>
        <p className="font-semibold text-sm line-clamp-2 leading-snug mb-1">
          {p.title}
        </p>
        <p className="font-bold text-primary text-sm">
          {formatPrice(p.price, p.currency ?? 'XOF')}
        </p>
      </div>
    </Link>
  );
}
