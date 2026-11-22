/**
 * TCK-2882 — la vignette de carte d'une visite : des tuiles OpenStreetMap posées en `<img>`, sans
 * bibliothèque de carte ni clé. Le fournisseur est celui des trois cartes Leaflet du dépôt (la fiche
 * publique d'un bien, la carte des biens, le choix d'un emplacement) : `tile.openstreetmap.org`,
 * attribution « © OpenStreetMap » obligatoire.
 *
 * Une tuile seule ne centre pas le bien : on calcule la position du point en pixels du monde
 * (projection Web Mercator) et on pose les tuiles voisines autour de lui, en décalage du point.
 */

export const TAILLE_DE_TUILE = 256;
export const ZOOM_DE_LA_VIGNETTE = 16;

export interface TuileOsm {
  readonly x: number;
  readonly y: number;
  readonly url: string;
  /** Décalage du coin haut-gauche de la tuile par rapport au point, en pixels. */
  readonly gauche: number;
  readonly haut: number;
}

/** Les pixels du monde (Web Mercator) du point, au zoom donné. */
export function pixelsDuMonde(latitude: number, longitude: number, zoom: number): { readonly x: number; readonly y: number } {
  const n = TAILLE_DE_TUILE * 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/** Des coordonnées lisibles : deux nombres finis, dans leurs bornes. `null` sinon. */
export function coordonneesLisibles(latitude: unknown, longitude: unknown): { readonly latitude: number; readonly longitude: number } | null {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined || latitude === '' || longitude === '') return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}

/**
 * Les tuiles (3 × 3 autour de celle du point) et leur décalage par rapport au point : posées dans un
 * conteneur dont l'origine est au centre de la vignette, elles centrent le bien. 3 × 3 couvre au moins
 * 256 px de chaque côté du point, plus que la moitié d'une vignette de téléphone (≈ 180 × 48).
 */
export function tuilesAutourDe(latitude: number, longitude: number, zoom = ZOOM_DE_LA_VIGNETTE): readonly TuileOsm[] {
  const p = pixelsDuMonde(latitude, longitude, zoom);
  const cx = Math.floor(p.x / TAILLE_DE_TUILE);
  const cy = Math.floor(p.y / TAILLE_DE_TUILE);
  const max = 2 ** zoom;
  const tuiles: TuileOsm[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const y = cy + dy;
      if (y < 0 || y >= max) continue;
      const x = (((cx + dx) % max) + max) % max;
      tuiles.push({
        x,
        y,
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        gauche: Math.round((cx + dx) * TAILLE_DE_TUILE - p.x),
        haut: Math.round(y * TAILLE_DE_TUILE - p.y),
      });
    }
  }
  return tuiles;
}
