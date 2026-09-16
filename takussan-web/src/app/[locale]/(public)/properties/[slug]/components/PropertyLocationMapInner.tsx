'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, ZoomControl } from 'react-leaflet';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

// Épingle en SVG EN LIGNE dans un `divIcon` — et non plus en `data:` URI : une image ne lit pas
// les variables CSS, d'où un bleu marine `#0c4a6e` écrit en dur, hors palette Lin. Dans le DOM,
// l'épingle prend `--primary` et suit le thème (revue design du 2026-09-16). Évite aussi les
// chemins d'assets par défaut de Leaflet, que le bundler de Next casse.
const SVG_NS = 'http://www.w3.org/2000/svg';

// Construite par le DOM et non par un littéral de balisage : le scanner i18n lit un gabarit SVG
// comme du texte affiché. Le composant n'est monté que côté client (`ssr: false`).
function creerEpingle(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 48');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '42');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'block drop-shadow-[0_2px_3px_color-mix(in_srgb,var(--shadow-color)_30%,transparent)]');
  const corps = document.createElementNS(SVG_NS, 'path');
  corps.setAttribute('d', 'M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32C32 7.2 24.8 0 16 0z');
  corps.setAttribute('fill', 'var(--primary)');
  const oeil = document.createElementNS(SVG_NS, 'circle');
  oeil.setAttribute('cx', '16');
  oeil.setAttribute('cy', '16');
  oeil.setAttribute('r', '6');
  oeil.setAttribute('fill', 'var(--card)');
  svg.append(corps, oeil);
  return svg;
}

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
      L.divIcon({
        className: '',
        html: creerEpingle(),
        iconSize: [28, 42],
        iconAnchor: [14, 42],
      }),
    [],
  );

  return (
    <div className="h-[350px] w-full overflow-hidden rounded-xl border border-border">
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
