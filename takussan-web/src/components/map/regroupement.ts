import Supercluster from 'supercluster';
import type { PropertyMapFeature } from '@/lib/queries/properties';

/**
 * TCK-553 — le regroupement des biens de la carte, sans Leaflet.
 *
 * M1 : 129 étiquettes de prix posées telles quelles, **573 paires** qui se chevauchaient à
 * 390 × 844 — aucune touchable isolément. TCK-047 exigeait des « marqueurs clusterisés » ;
 * TCK-162 l'avait différé « au-delà de ~150 marqueurs ». Le défaut était là dès 129.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI `supercluster`, ET PAS `leaflet.markercluster`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le calcul se fait ici, en fonction pure (points, emprise, zoom → éléments), et c'est ce qui le
 * rend TESTABLE sans carte : jsdom n'a pas de mise en page, et un greffon Leaflet ne se vérifie
 * qu'au navigateur. La carte (`PropertyMap`) ne fait plus que poser ce que cette fonction rend,
 * avec les `<Marker>` de react-leaflet qu'elle posait déjà — les aperçus (`Popup`) sont inchangés.
 *
 * Aucun changement d'API (contrainte du ticket) : on regroupe les points DÉJÀ reçus de `/map`.
 */

/**
 * Le rayon de regroupement, en pixels À L'ÉCRAN.
 *
 * ⚠ Ce n'est pas un réglage de goût : c'est ce qui garantit l'AC1. `supercluster` ne laisse
 * isolés que des points distants de PLUS que ce rayon au zoom courant ; une étiquette de prix fait
 * 60 × 28 px (`iconSize` de `createPriceIcon`), dont la diagonale vaut 66 px. En deçà, deux
 * étiquettes isolées peuvent se toucher. 80 laisse la marge d'une étiquette un peu plus large que
 * sa boîte (« 12,5 M »).
 */
export const RAYON_DE_REGROUPEMENT_PX = 80;

/**
 * Le zoom maximal de la carte — celui des tuiles OpenStreetMap.
 *
 * Le regroupement s'applique JUSQU'À lui, et c'est un arbitrage : l'arrêter un cran avant aurait
 * posé côte à côte, au zoom maximal, des étiquettes qui se chevauchent (le test de l'AC1 l'a
 * montré). Le prix de ce choix : des biens à moins de ~23 m (80 px au zoom 19, à la latitude de
 * Dakar) — les appartements d'un même immeuble, qui partagent souvent leurs coordonnées — restent
 * une grappe que le zoom ne sépare plus. Celle-là, le tap l'ouvre en liste (`zoomQuiSepare`
 * rend `null`).
 */
export const ZOOM_MAX_DE_LA_CARTE = 19;

/**
 * `extent: 256` : la taille d'une tuile de Leaflet. `supercluster` mesure son rayon dans une
 * tuile de `extent` unités, et son défaut (512) est celui des tuiles vectorielles — il aurait
 * divisé le rayon réel par deux.
 */
const OPTIONS = {
  radius: RAYON_DE_REGROUPEMENT_PX,
  extent: 256,
  maxZoom: ZOOM_MAX_DE_LA_CARTE,
  minPoints: 2,
} as const;

export type IndexDesBiens = Supercluster<PropertyMapFeature['properties']>;

export type ElementDeCarte =
  | {
      readonly genre: 'grappe';
      readonly id: number;
      readonly lat: number;
      readonly lng: number;
      /** Le nombre de biens de la grappe — ce qu'elle affiche. */
      readonly nombre: number;
    }
  | { readonly genre: 'bien'; readonly feature: PropertyMapFeature };

/** Indexe les points reçus de `/map`. À refaire quand la réponse change, pas à chaque zoom. */
export function indexerLesBiens(features: readonly PropertyMapFeature[]): IndexDesBiens {
  const index = new Supercluster<PropertyMapFeature['properties']>(OPTIONS);
  index.load(features as PropertyMapFeature[]);
  return index;
}

/**
 * Ce que la carte pose dans l'emprise `[ouest, sud, est, nord]` au zoom `zoom` : des grappes
 * portant leur nombre, et des biens isolés — ceux-ci rendus tels que `/map` les a servis, pour
 * que leur étiquette et leur aperçu restent ceux d'aujourd'hui (TCK-162).
 */
export function elementsDeCarte(
  index: IndexDesBiens,
  emprise: [number, number, number, number],
  zoom: number,
): ElementDeCarte[] {
  return index.getClusters(emprise, zoom).map((f): ElementDeCarte => {
    const [lng, lat] = f.geometry.coordinates;
    if ('cluster' in f.properties && f.properties.cluster) {
      return {
        genre: 'grappe',
        id: f.properties.cluster_id,
        lat,
        lng,
        nombre: f.properties.point_count,
      };
    }
    return { genre: 'bien', feature: f as PropertyMapFeature };
  });
}

/**
 * Le zoom auquel un tap sur la grappe `id` la sépare en plusieurs éléments — ou `null` quand
 * aucun zoom de la carte n'y parvient (des biens au même endroit) : la grappe s'ouvre alors en
 * liste, cf. `biensDeLaGrappe`.
 */
export function zoomQuiSepare(index: IndexDesBiens, id: number): number | null {
  const zoom = index.getClusterExpansionZoom(id);
  return zoom > ZOOM_MAX_DE_LA_CARTE ? null : zoom;
}

/** Les biens d'une grappe, tels que `/map` les a servis. */
export function biensDeLaGrappe(index: IndexDesBiens, id: number): PropertyMapFeature[] {
  return index.getLeaves(id, Infinity) as PropertyMapFeature[];
}
