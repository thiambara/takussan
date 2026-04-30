'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { useMemo } from 'react';

const DEFAULT_CENTER: [number, number] = [14.6928, -17.4467]; // Dakar
const DEFAULT_ZOOM = 13;

interface LocationPickerMapProps {
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly onChange: (lat: number, lng: number) => void;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LocationPickerMap({ lat, lng, onChange }: LocationPickerMapProps) {
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;background:#1d4ed8;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    [],
  );

  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      style={{ height: '240px', width: '100%', borderRadius: '0.5rem' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
      {lat != null && lng != null && (
        <Marker
          position={[lat, lng]}
          icon={markerIcon}
          draggable
          eventHandlers={{
            dragend(e) {
              const pos = (e.target as L.Marker).getLatLng();
              onChange(pos.lat, pos.lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
