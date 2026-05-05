'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, ZoomControl } from 'react-leaflet';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

// Inline SVG pin — avoids Next.js bundler issues with Leaflet's default asset paths.
const PIN_SVG = encodeURIComponent(
  `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 48" width="32" height="48">
    <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32C32 7.2 24.8 0 16 0z" fill="#0c4a6e"/>
    <circle cx="16" cy="16" r="6" fill="#ffffff"/>
  </svg>`,
);

export interface PropertyLocationMapInnerProps {
  latitude: number;
  longitude: number;
}

export function PropertyLocationMapInner({ latitude, longitude }: PropertyLocationMapInnerProps) {
  const t = useTranslations('map');
  const position: [number, number] = [latitude, longitude];
  const markerAlt = t('markerAlt');
  const icon = useMemo(
    () =>
      L.icon({
        iconUrl: `data:image/svg+xml;charset=UTF-8,${PIN_SVG}`,
        iconSize: [28, 42],
        iconAnchor: [14, 42],
      }),
    [],
  );

  return (
    <div className="h-[350px] w-full overflow-hidden rounded-xl border border-stone-200">
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="topright" zoomInTitle={t('zoomIn')} zoomOutTitle={t('zoomOut')} />
        <Marker position={position} icon={icon} alt={markerAlt} title={markerAlt} />
      </MapContainer>
    </div>
  );
}
