/**
 * TCK-633 (AC9) — les Plus Codes (Open Location Code), décodés ICI plutôt que par le paquet
 * `open-location-code` : 1.0.3, CommonJS, API par prototype, sans types, inchangé depuis 2022.
 *
 * Deux formes :
 *   · COMPLET (`7C64PG8J+MW`) — se décode seul ;
 *   · COURT (`PG8J+MW`, `8J+MW`) — il manque le préfixe ; on le récupère depuis un point de
 *     RÉFÉRENCE proche (le centre de la ville choisie), comme `recoverNearest` de la référence.
 *     ⚠ Une mauvaise référence ne lève rien : `HPMH+86` rapporté à Dakar tombe à 14,58° N, en mer,
 *     au lieu de Ziguinchor. C'est pourquoi la référence est la VILLE choisie, jamais Dakar par défaut.
 *
 * Vecteurs validés contre l'implémentation de référence (Google) le 2026-10-12.
 */
export const ALPHABET_PLUS_CODE = '23456789CFGHJMPQRVWX';
const RESOLUTIONS_DES_PAIRES = [20, 1, 0.05, 0.0025, 0.000125] as const;

export const PLUS_CODE_COMPLET = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7}$/;
export const PLUS_CODE_COURT = /^(?:[23456789CFGHJMPQRVWX]{2}){1,3}\+[23456789CFGHJMPQRVWX]{2,7}$/;

export interface PointPlusCode {
  readonly latitude: number;
  readonly longitude: number;
}

/** Le centre de la cellule d'un code COMPLET ; `null` pour toute autre forme. */
export function decoderPlusCode(code: string): PointPlusCode | null {
  const c = code.trim().toUpperCase();
  if (!PLUS_CODE_COMPLET.test(c)) return null;
  const nu = c.replace('+', '');
  // Le premier caractère borne la latitude (≤ 9 → 180°), le second la longitude (≤ 17 → 360°).
  if (ALPHABET_PLUS_CODE.indexOf(nu[0]) > 8 || ALPHABET_PLUS_CODE.indexOf(nu[1]) > 17) return null;

  let latitude = -90;
  let longitude = -180;
  let pasLat = 0;
  let pasLng = 0;
  for (let i = 0; i < Math.min(nu.length, 10); i += 2) {
    const resolution = RESOLUTIONS_DES_PAIRES[i / 2];
    latitude += ALPHABET_PLUS_CODE.indexOf(nu[i]) * resolution;
    longitude += ALPHABET_PLUS_CODE.indexOf(nu[i + 1]) * resolution;
    pasLat = resolution;
    pasLng = resolution;
  }
  // Au-delà de dix caractères : une grille de 5 lignes × 4 colonnes par caractère.
  for (let i = 10; i < nu.length; i++) {
    pasLat /= 5;
    pasLng /= 4;
    const chiffre = ALPHABET_PLUS_CODE.indexOf(nu[i]);
    latitude += Math.floor(chiffre / 4) * pasLat;
    longitude += (chiffre % 4) * pasLng;
  }
  return { latitude: latitude + pasLat / 2, longitude: longitude + pasLng / 2 };
}

/** Les `n` premiers caractères du code complet d'un point (au plus huit). */
function prefixeDe(latitude: number, longitude: number, n: number): string {
  let resteLat = Math.min(Math.max(latitude, -90), 90) + 90;
  let resteLng = (((longitude + 180) % 360) + 360) % 360;
  let code = '';
  for (const resolution of RESOLUTIONS_DES_PAIRES.slice(0, 4)) {
    const a = Math.min(Math.floor(resteLat / resolution), 19);
    const b = Math.min(Math.floor(resteLng / resolution), 19);
    code += ALPHABET_PLUS_CODE[a] + ALPHABET_PLUS_CODE[b];
    resteLat -= a * resolution;
    resteLng -= b * resolution;
  }
  return code.slice(0, n);
}

/** Un code COURT rapporté à la cellule la plus proche de la référence ; `null` sinon. */
export function recupererPlusCodeCourt(code: string, reference: PointPlusCode): PointPlusCode | null {
  const c = code.trim().toUpperCase();
  if (!PLUS_CODE_COURT.test(c)) return null;
  const manquants = 8 - c.indexOf('+');
  const resolution = Math.pow(20, 2 - manquants / 2);
  const demi = resolution / 2;
  const centre = decoderPlusCode(prefixeDe(reference.latitude, reference.longitude, manquants) + c);
  if (!centre) return null;

  let { latitude, longitude } = centre;
  if (reference.latitude + demi < latitude && latitude - resolution >= -90) latitude -= resolution;
  else if (reference.latitude - demi > latitude && latitude + resolution <= 90) latitude += resolution;
  if (reference.longitude + demi < longitude) longitude -= resolution;
  else if (reference.longitude - demi > longitude) longitude += resolution;
  return { latitude, longitude };
}
