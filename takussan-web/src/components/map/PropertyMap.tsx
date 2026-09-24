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
import { cn, formatPrice } from '@/lib/utils';
import { formatPriceShort } from '@/lib/format/currency';
import {
  usePropertyMapQuery,
  type MapBounds,
  type PropertyMapFeature,
} from '@/lib/queries/properties';
import {
  ZOOM_MAX_DE_LA_CARTE,
  biensDeLaGrappe,
  elementsDeCarte,
  indexerLesBiens,
  zoomQuiSepare,
} from './regroupement';

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

/**
 * TCK-553 — la grappe : un disque qui porte son nombre de biens.
 *
 * Plus grande qu'une étiquette de prix et d'une autre encre (`--foreground`, pas le terracotta
 * des prix), pour qu'on ne la lise pas comme un prix. Son diamètre croît par paliers avec le
 * nombre, et ne descend jamais sous 44 px : c'est une cible tactile.
 */
function createClusterIcon(count: number, label: string): L.DivIcon {
  const taille = count < 10 ? 44 : count < 50 ? 48 : 54;
  const safeLabel = escapeHtml(label);
  return L.divIcon({
    className: 'takussan-cluster-marker',
    html: `<button
      type="button"
      class="takussan-cluster-marker__disque"
      aria-label="${safeLabel}"
      title="${safeLabel}"
    ><span aria-hidden="true">${count}</span></button>`,
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
    popupAnchor: [0, -taille / 2],
  });
}

// Default viewport — Dakar, Senegal.
const DEFAULT_CENTER: [number, number] = [14.6928, -17.4467];
const DEFAULT_ZOOM = 12;

export interface PropertyMapProps {
  readonly className?: string;
  readonly height?: string;
  /**
   * TCK-553 — sous `lg`, la carte remplit son conteneur (la page le cale sous la `nav`, sur toute
   * la hauteur de l'écran) : ni hauteur fixe, ni cadre arrondi. À partir de `lg`, `height` et le
   * cadre d'avant s'appliquent — la mise en page du bureau ne change pas.
   */
  readonly pleinEcranSousLg?: boolean;
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

/**
 * TCK-553 — Leaflet ne voit que les redimensionnements de la FENÊTRE. Or la carte plein écran
 * mobile se cale sur la `nav` mesurée : si la `nav` change de hauteur, le conteneur change de
 * taille sans que la fenêtre bouge, et Leaflet garderait des tuiles et des bornes périmées.
 */
function SuiviDeLaTaille() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => map.invalidateSize());
    obs.observe(map.getContainer());
    return () => obs.disconnect();
  }, [map]);
  return null;
}

/** L'emprise où chercher les éléments à poser : la vue, élargie d'un quart de chaque côté. */
function lireLaVue(map: LeafletMap): { emprise: [number, number, number, number]; zoom: number } {
  const b = map.getBounds().pad(0.25);
  return {
    emprise: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    zoom: map.getZoom(),
  };
}

/**
 * TCK-562 (W2) — ce qui porte l'aperçu OUVERT, figé hors du regroupement jusqu'à sa fermeture.
 *
 * Ouvrir un aperçu déplace la vue (`autoPan` de Leaflet) : nouvelles bornes, nouvelle réponse de
 * `/map`, nouvel index. Sans épingle, le marqueur qui porte l'aperçu pouvait être démonté par ce
 * seul rechargement — et Leaflet ferme l'aperçu d'un marqueur retiré : « il se referme tout seul »
 * (retour du 2026-09-23). Deux chemins y menaient :
 *
 *  - un bien isolé ABSORBÉ par une grappe, quand la nouvelle réponse apporte un voisin qui était
 *    juste hors de la vue — le cas même d'un bien au bord, celui dont l'aperçu fait bouger la carte ;
 *  - une grappe ouverte en liste qui change d'identifiant : `supercluster` numérote ses grappes à
 *    partir du NOMBRE de points indexés, un bien de plus suffit.
 *
 * L'élément épinglé est retiré de l'index — les comptes restent justes, aucun bien n'est posé deux
 * fois — et posé tel qu'il était à l'ouverture, sous la MÊME clé React : l'épingler ne le démonte
 * pas. Fermé, il retourne au regroupement.
 */
type Epingle =
  | { readonly genre: 'bien'; readonly feature: PropertyMapFeature }
  | {
      readonly genre: 'liste';
      readonly biens: PropertyMapFeature[];
      readonly position: [number, number];
    };

function idsEpingles(epingle: Epingle | null): number[] {
  if (epingle === null) return [];
  return epingle.genre === 'bien'
    ? [epingle.feature.properties.id]
    : epingle.biens.map((f) => f.properties.id);
}

/**
 * La clé d'une grappe qui s'ouvre en liste : ses biens, et non l'identifiant de `supercluster`,
 * qui change à chaque nouvel index. Les grappes d'un index sont disjointes : le plus petit
 * identifiant suffit à les distinguer.
 */
function cleDeListe(biens: readonly PropertyMapFeature[]): string {
  return `liste-${Math.min(...biens.map((f) => f.properties.id))}`;
}

/**
 * TCK-553 — ce que la carte pose : des grappes aux zooms larges, les étiquettes de prix (TCK-162)
 * une fois les biens assez séparés pour être lus et touchés. Le calcul vit dans `regroupement.ts`.
 */
function CoucheDesBiens({
  features,
  onMarkerClick,
}: {
  features: PropertyMapFeature[];
  onMarkerClick?: (feature: PropertyMapFeature) => void;
}) {
  const [epingle, setEpingle] = useState<Epingle | null>(null);
  // L'index porte une SÉMANTIQUE, pas une optimisation : les identifiants de grappes qu'il
  // attribue ne valent que pour lui. Il se refait quand la réponse change, ou l'épingle — pas à
  // chaque zoom.
  const index = useMemo(() => {
    const ecartes = new Set(idsEpingles(epingle));
    return indexerLesBiens(
      ecartes.size === 0 ? features : features.filter((f) => !ecartes.has(f.properties.id)),
    );
  }, [features, epingle]);
  // La carte existe déjà quand ses enfants se rendent (react-leaflet ne les monte qu'après) : la
  // première lecture se fait à l'initialisation, sans effet.
  const map = useMap();
  const [vue, setVue] = useState(() => lireLaVue(map));
  useMapEvents({
    moveend: () => setVue(lireLaVue(map)),
    zoomend: () => setVue(lireLaVue(map)),
  });

  // Une fermeture ne lève que SA propre épingle : ouvrir un autre aperçu ferme le précédent
  // (`autoClose`), et l'ordre des deux événements ne doit pas décider de l'épingle restante.
  // Leaflet 1.9.4 livre la fermeture de l'ancien AVANT l'ouverture du nouveau (`Popup.openOn`) :
  // la garde ne décide de rien avec cet ordre-là, elle empêche d'en dépendre — tests « fermeture
  // tardive » de `PropertyMap.popup.test.tsx`.
  const epinglerLeBien = (feature: PropertyMapFeature) => setEpingle({ genre: 'bien', feature });
  const desepinglerLeBien = (id: number) =>
    setEpingle((e) => (e?.genre === 'bien' && e.feature.properties.id === id ? null : e));
  const epinglerLaListe = (biens: PropertyMapFeature[], position: [number, number]) =>
    setEpingle({ genre: 'liste', biens, position });
  const desepinglerLaListe = (cle: string) =>
    setEpingle((e) => (e?.genre === 'liste' && cleDeListe(e.biens) === cle ? null : e));

  const marqueurDeBien = (feature: PropertyMapFeature) => (
    <MarqueurDeBien
      key={`bien-${feature.properties.id}`}
      feature={feature}
      onMarkerClick={onMarkerClick}
      onOuverture={() => epinglerLeBien(feature)}
      onFermeture={() => desepinglerLeBien(feature.properties.id)}
    />
  );
  const marqueurDeListe = (biens: PropertyMapFeature[], position: [number, number]) => {
    const cle = cleDeListe(biens);
    return (
      <MarqueurDeListe
        key={cle}
        biens={biens}
        position={position}
        onOuverture={() => epinglerLaListe(biens, position)}
        onFermeture={() => desepinglerLaListe(cle)}
      />
    );
  };

  // UN tableau plat de marqueurs à clé : un tableau imbriqué serait un autre niveau de
  // réconciliation, et l'élément épinglé y serait remonté — donc son aperçu refermé.
  const marqueurs = elementsDeCarte(index, vue.emprise, vue.zoom).map((element) => {
    if (element.genre === 'bien') return marqueurDeBien(element.feature);
    const position: [number, number] = [element.lat, element.lng];
    const cible = zoomQuiSepare(index, element.id);
    if (cible === null) return marqueurDeListe(biensDeLaGrappe(index, element.id), position);
    return (
      <MarqueurDeGrappe
        key={`grappe-${element.id}`}
        position={position}
        nombre={element.nombre}
        cible={cible}
      />
    );
  });
  if (epingle?.genre === 'bien') marqueurs.push(marqueurDeBien(epingle.feature));
  if (epingle?.genre === 'liste') marqueurs.push(marqueurDeListe(epingle.biens, epingle.position));
  return marqueurs;
}

/**
 * TCK-562 (W2) — la position d'un marqueur, STABLE d'un rendu à l'autre tant qu'elle ne change pas.
 *
 * react-leaflet compare `position` par identité : un tableau neuf à chaque rendu appelle
 * `marker.setLatLng()`, qui relance l'`autoPan` de l'aperçu ouvert (`_movePopup` → `_adjustPan`),
 * lequel ARRÊTE l'animation en cours — `moveend` synchrone → nouvelles bornes → nouveau rendu →
 * nouveau `setLatLng`… Mesuré au navigateur sur l'épingle, code NON compilé : 14 413 `panBy` et
 * 187 requêtes `/map` en cinq secondes pour UN aperçu ouvert. Même raison pour l'icône (`setIcon`
 * remplace le HTML du marqueur) et le contenu de l'aperçu (react-leaflet appelle `popup.update()`
 * quand il change).
 *
 * Le React Compiler (ADR-0015) mémoïse déjà ces valeurs dans le build — mesuré : aucune tempête
 * compilé. La mémoïsation est écrite quand même parce qu'elle porte une SÉMANTIQUE (l'identité
 * pilote Leaflet), et qu'une garantie qui ne tiendrait que par le compilateur tomberait avec lui :
 * la suite de tests ne compile pas, et un composant qu'il abandonne perd tout.
 */
function usePosition(lat: number, lng: number): [number, number] {
  return useMemo(() => [lat, lng], [lat, lng]);
}

function MarqueurDeBien({
  feature,
  onMarkerClick,
  onOuverture,
  onFermeture,
}: {
  feature: PropertyMapFeature;
  onMarkerClick?: (feature: PropertyMapFeature) => void;
  onOuverture: () => void;
  onFermeture: () => void;
}) {
  const t = useTranslations('map');
  const p = feature.properties;
  const currency = p.currency ?? 'XOF';
  const fullPrice = formatPrice(p.price, currency);
  const position = usePosition(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
  const icone = useMemo(
    () => createPriceIcon(p.price, currency, fullPrice),
    [p.price, currency, fullPrice],
  );
  const apercu = useMemo(() => <MapPopupCard feature={feature} />, [feature]);
  return (
    <Marker
      position={position}
      icon={icone}
      alt={`${t('markerAlt')} — ${fullPrice}`}
      title={fullPrice}
      eventHandlers={{
        click: () => onMarkerClick?.(feature),
        popupopen: onOuverture,
        popupclose: onFermeture,
      }}
    >
      <Popup>{apercu}</Popup>
    </Marker>
  );
}

/** Un tap sur une grappe zoome jusqu'à la séparer (AC2). */
function MarqueurDeGrappe({
  position: positionRecue,
  nombre,
  cible,
}: {
  position: [number, number];
  nombre: number;
  cible: number;
}) {
  const t = useTranslations('map');
  const map = useMap();
  const position = usePosition(positionRecue[0], positionRecue[1]);
  const libelle = t('clusterZoom', { count: nombre });
  const icone = useMemo(() => createClusterIcon(nombre, libelle), [nombre, libelle]);

  return (
    <Marker
      position={position}
      icon={icone}
      title={libelle}
      alt={libelle}
      eventHandlers={{
        click: () => map.flyTo(position, cible),
      }}
    />
  );
}

/**
 * Une grappe qu'aucun zoom ne sépare — des biens au même endroit, les appartements d'un immeuble —
 * s'ouvre en liste à la place : sans quoi elle serait une impasse.
 */
function MarqueurDeListe({
  biens,
  position: positionRecue,
  onOuverture,
  onFermeture,
}: {
  biens: PropertyMapFeature[];
  position: [number, number];
  onOuverture: () => void;
  onFermeture: () => void;
}) {
  const t = useTranslations('map');
  const position = usePosition(positionRecue[0], positionRecue[1]);
  const libelle = t('clusterList', { count: biens.length });
  const icone = useMemo(() => createClusterIcon(biens.length, libelle), [biens.length, libelle]);
  const apercu = useMemo(() => <ListeDeLaGrappe biens={biens} />, [biens]);

  return (
    <Marker
      position={position}
      icon={icone}
      title={libelle}
      alt={libelle}
      eventHandlers={{
        popupopen: onOuverture,
        popupclose: onFermeture,
      }}
    >
      <Popup>{apercu}</Popup>
    </Marker>
  );
}

function ListeDeLaGrappe({ biens }: { biens: PropertyMapFeature[] }) {
  const t = useTranslations('map');
  return (
    <div className="w-[240px]">
      {/* `bg-card` : le fond du popup de Leaflet (#fff) DÉCLARÉ, pour que la garde de contraste
          (TCK-458) juge cette encre sur la surface où elle est posée. */}
      <p className="bg-card px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
        {t('clusterListTitle', { count: biens.length })}
      </p>
      <ul className="max-h-60 overflow-y-auto">
        {biens.map((f) => (
          <li key={f.properties.id} className="border-t border-border first:border-t-0">
            <LienLocalise
              href={`/properties/${f.properties.slug}`}
              className="block px-2 py-2 no-underline text-foreground hover:bg-muted"
            >
              <span className="block text-sm font-semibold leading-snug line-clamp-2">
                {f.properties.title}
              </span>
              <span className="block text-sm font-bold text-primary">
                {formatPrice(f.properties.price, f.properties.currency ?? 'XOF')}
              </span>
            </LienLocalise>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PropertyMap({
  className = '',
  height = 'h-[520px]',
  pleinEcranSousLg = false,
  filters = {},
  onMarkerClick,
}: PropertyMapProps) {
  const t = useTranslations('map');
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const query = usePropertyMapQuery(bounds, filters);

  const features = query.data?.features ?? [];

  return (
    <div
      className={cn(
        'relative',
        pleinEcranSousLg && 'takussan-carte-plein-ecran h-full lg:h-auto',
        className,
      )}
    >
      <div
        className={cn(
          'w-full overflow-hidden',
          pleinEcranSousLg
            ? 'h-full lg:h-[520px] lg:rounded-xl lg:border lg:border-border'
            : cn(height, 'rounded-xl border border-border'),
        )}
      >
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
            // TCK-553 — le zoom maximal de la CARTE vient de ses couches (`getMaxZoom()` de
            // Leaflet) : sans ce réglage, 18 par défaut, et `flyTo(…, 19)` vers une grappe que seul
            // le zoom 19 sépare serait ramené à 18 — la grappe resterait entière.
            maxZoom={ZOOM_MAX_DE_LA_CARTE}
          />
          <ZoomControl zoomInTitle={t('zoomIn')} zoomOutTitle={t('zoomOut')} />
          <SuiviDeLaTaille />
          <BoundsWatcher onChange={setBounds} />
          <FitToFeatures features={features} />
          <CoucheDesBiens features={features} onMarkerClick={onMarkerClick} />
        </MapContainer>
      </div>

      {/*
        TCK-553 (M3) — le compte de la carte, pas celui de la liste. `/map` ne reçoit pas `q` et ne
        place pas un bien sans coordonnées : « 140 biens trouvés » au-dessus de 129 marqueurs
        affirmait deux nombres pour une recherche. Ce compte est celui des points REÇUS (AC4) ;
        plafonné, il le dit (`truncated`), au même endroit — l'ancienne pastille du coin bas-gauche
        serait passée sous la pastille flottante Filtres/Liste sur mobile.
      */}
      <p
        data-compte-carte
        aria-live="polite"
        className="pointer-events-none absolute top-3 right-3 z-[400] flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 text-xs font-semibold tabular-nums text-foreground shadow"
      >
        {query.isFetching && (
          <span
            aria-hidden="true"
            className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
        )}
        {query.data
          ? query.data.meta.truncated
            ? t('truncated', { count: query.data.meta.returned })
            : t('onMap', { count: features.length })
          : t('loading')}
      </p>
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
      className="block w-[220px] no-underline text-foreground"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-md bg-muted">
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
        <p className="text-xs text-muted-foreground mb-0.5">
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
