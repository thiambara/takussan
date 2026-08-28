'use client';

import 'leaflet/dist/leaflet.css';
import L, { type Map as LeafletMap } from 'leaflet';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import Image from 'next/image';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/utils';
import { formatPriceShort } from '@/lib/format/currency';
import {
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

/**
 * TCK-162 — price-pill marker. We escape the formatted text once at icon
 * build time so the resulting `divIcon` HTML is safe even if a future
 * locale ever returns characters with semantic meaning in HTML.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function createPriceIcon(price: number, currency: string, fullLabel: string): L.DivIcon {
  const short = formatPriceShort(price);
  const safeShort = escapeHtml(short);
  const safeFull = escapeHtml(fullLabel);
  const safeCurrency = escapeHtml(currency);
  return L.divIcon({
    className: 'takussan-price-marker',
    html: `<button
      type="button"
      class="takussan-price-marker__pill"
      aria-label="${safeFull}"
      title="${safeFull}"
      data-currency="${safeCurrency}"
    ><span aria-hidden="true">${safeShort}</span></button>`,
    iconSize: [60, 28],
    iconAnchor: [30, 28],
    popupAnchor: [0, -26],
  });
}

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
  // TCK-316 — `emit` était une DÉCLARATION de fonction placée après les
  // gestionnaires qui l'appellent. Le hoisting de JavaScript rendait ça
  // fonctionnel, mais la fermeture capturait `map` et `onChange` d'un rendu
  // antérieur : « accessed before it is declared, which prevents the earlier
  // access from updating when this value changes over time ». Déclarée AVANT,
  // et mémoïsée sur ses deux vraies dépendances, elle suit les rendus.
  const emit = useCallback(
    (leafletMap: LeafletMap) => {
      const b = leafletMap.getBounds();
      onChange({
        swLat: b.getSouthWest().lat,
        swLng: b.getSouthWest().lng,
        neLat: b.getNorthEast().lat,
        neLng: b.getNorthEast().lng,
      });
    },
    [onChange],
  );

  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });

  // Une première émission au montage — l'effet est légitime : il synchronise un
  // système extérieur (Leaflet) avec React, ce que la règle autorise.
  useEffect(() => {
    emit(map);
  }, [emit, map]);

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
  const t = useTranslations('map');
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const query = usePropertyMapQuery(bounds, filters);
  const markerAlt = t('markerAlt');

  const features = query.data?.features ?? [];

  return (
    <div className={`relative ${className}`}>
      <div className={`${height} w-full overflow-hidden rounded-xl border border-stone-200`}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl zoomInTitle={t('zoomIn')} zoomOutTitle={t('zoomOut')} />
          <BoundsWatcher onChange={setBounds} />
          <FitToFeatures features={features} />
          {features.map((feature) => {
            const p = feature.properties;
            const currency = p.currency ?? 'XOF';
            const fullPrice = formatPrice(p.price, currency);
            return (
              <Marker
                key={p.id}
                position={[
                  feature.geometry.coordinates[1],
                  feature.geometry.coordinates[0],
                ]}
                icon={createPriceIcon(p.price, currency, fullPrice)}
                alt={`${markerAlt} — ${fullPrice}`}
                title={fullPrice}
                eventHandlers={{
                  click: () => onMarkerClick?.(feature),
                }}
              >
                <Popup>
                  <MapPopupCard feature={feature} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {query.isFetching && (
        <div className="pointer-events-none absolute top-3 right-3 z-[400] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-600 shadow">
          {t('loading')}
        </div>
      )}
      {query.data?.meta.truncated && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 shadow">
          {t('truncated', { count: query.data.meta.returned })}
        </div>
      )}
    </div>
  );
}

function MapPopupCard({ feature }: { feature: PropertyMapFeature }) {
  const t = useTranslations('property.contractTypes');
  const p = feature.properties;
  const isSale = p.contract_type === 'sale';
  return (
    <LienLocalise
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
          {t(isSale ? 'saleLong' : 'rentLong')}
        </p>
        <p className="font-semibold text-sm line-clamp-2 leading-snug mb-1">
          {p.title}
        </p>
        <p className="font-bold text-primary text-sm">
          {formatPrice(p.price, p.currency ?? 'XOF')}
        </p>
      </div>
    </LienLocalise>
  );
}
