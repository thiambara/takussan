'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo } from 'react';

const DEFAULT_CENTER: [number, number] = [14.6928, -17.4467]; // Dakar
const DEFAULT_ZOOM = 13;
/** TCK-633 — assez près pour poser le marqueur sur la bonne rue. */
const ZOOM_POSITION = 16;

interface LocationPickerMapProps {
  readonly lat?: number | null;
  readonly lng?: number | null;
  /** TCK-633 — le centre de la ville choisie, tant qu'aucune position n'est posée. */
  readonly centre?: { readonly latitude: number; readonly longitude: number } | null;
  readonly onChange: (lat: number, lng: number) => void;
}

/**
 * TCK-633 — `center` de `MapContainer` n'est lu qu'au MONTAGE : une position collée, ou une ville
 * choisie après coup, ne déplaçait pas la carte, et le marqueur se posait hors de la vue.
 */
function Recentrer({
  lat,
  lng,
  centre,
}: {
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly centre?: { readonly latitude: number; readonly longitude: number } | null;
}) {
  const map = useMap();
  const cLat = centre?.latitude ?? null;
  const cLng = centre?.longitude ?? null;
  useEffect(() => {
    if (lat != null && lng != null) {
      if (!map.getBounds().contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), ZOOM_POSITION));
      return;
    }
    if (cLat !== null && cLng !== null) map.setView([cLat, cLng], DEFAULT_ZOOM);
  }, [map, lat, lng, cLat, cLng]);
  return null;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LocationPickerMap({ lat, lng, centre, onChange }: LocationPickerMapProps) {
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;background:var(--primary);border:2px solid var(--card);border-radius:50%;box-shadow:0 1px 4px color-mix(in srgb,var(--shadow-color) 40%,transparent)"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    [],
  );

  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : centre ? [centre.latitude, centre.longitude] : DEFAULT_CENTER;

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
      <Recentrer lat={lat} lng={lng} centre={centre} />
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
