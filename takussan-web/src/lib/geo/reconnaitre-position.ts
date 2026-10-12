import {
  decoderPlusCode,
  recupererPlusCodeCourt,
  type PointPlusCode,
} from '@/lib/geo/plus-code';

/**
 * TCK-633 (AC9) — « Collez un lien ou une position » : ce que la personne colle, reconnu SANS
 * réseau quand c'est possible.
 *
 * Ce qui se lit ici : un lien Google Maps LONG (`!3d…!4d…`, `?q=`, `query=`, `ll=`, `@lat,lng`),
 * le message de position de WhatsApp (`https://maps.google.com/maps?q=lat%2Clng`), un lien
 * OpenStreetMap (`mlat`/`mlon`, `#map=z/lat/lon`) ou Plans d'Apple (`ll=`, `coordinate=`), une
 * URI `geo:`, des degrés décimaux — avec ou sans `°` et hémisphère, à la façon de Plans
 * (« 14,7167° N, 17,4677° O ») —, des degrés-minutes-secondes, un Plus Code complet ou court.
 *
 * Ce qui ne se lit PAS ici : un lien COURT (`maps.app.goo.gl/…`) ne porte aucune coordonnée — il
 * faut suivre sa redirection, ce que seul le serveur fait (`POST /api/geo/resolve-link`, garde
 * SSRF). Le résultat le dit (`lien-a-resoudre`) au lieu de renvoyer « inconnu ».
 *
 * ⚠ `coordonneesDepuisLienGoogle` a une JUMELLE côté API (`GoogleMapsCoordinates::depuisUrl`) :
 * les deux lisent `takussan-api/tests/fixtures/liens-google-maps.json`. Un format ajouté d'un
 * seul côté rougit l'autre suite.
 */
export interface Coordonnees {
  readonly latitude: number;
  readonly longitude: number;
}

export type SourcePosition = 'lien' | 'geo' | 'decimal' | 'dms' | 'plus-code' | 'plus-code-court';

export type PositionReconnue =
  | ({ readonly kind: 'coordonnees'; readonly source: SourcePosition } & Coordonnees)
  | { readonly kind: 'lien-a-resoudre'; readonly url: string }
  | { readonly kind: 'plus-code-court-sans-reference'; readonly code: string }
  | { readonly kind: 'inconnu' };

/** Le cadre du Sénégal (ADR-0062 §5) : hors de lui, la position est SIGNALÉE, jamais refusée. */
export const CADRE_SENEGAL = { latMin: 12.2, latMax: 16.8, lngMin: -17.6, lngMax: -11.3 } as const;

export function horsDuSenegal({ latitude, longitude }: Coordonnees): boolean {
  return (
    latitude < CADRE_SENEGAL.latMin ||
    latitude > CADRE_SENEGAL.latMax ||
    longitude < CADRE_SENEGAL.lngMin ||
    longitude > CADRE_SENEGAL.lngMax
  );
}

/** Les hôtes Google dont un lien se lit ou se résout. La liste de l'API est la même. */
const HOTES_GOOGLE = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'maps.google.sn',
  'www.google.com',
  'google.com',
  'www.google.sn',
  'google.sn',
]);

const NOMBRE_LAT = '(-?\\d{1,2}(?:\\.\\d+)?)';
const NOMBRE_LNG = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIRE_EN_PARAMETRE = new RegExp(`^\\s*${NOMBRE_LAT}\\s*,\\s*${NOMBRE_LNG}\\s*$`);
const PAIRE_APRES_AROBASE = new RegExp(`/@${NOMBRE_LAT},${NOMBRE_LNG}(?:,|$|/|\\?)`);
const REPERE_DE_FICHE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

function valider(lat: string | number, lng: string | number): Coordonnees | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Les coordonnées écrites dans un lien Google Maps, dans l'ordre de l'API : le repère de la fiche
 * (`!3d!4d`) d'abord — le `@` n'est que le CENTRE de la carte affichée, souvent décalé du lieu —,
 * puis les paramètres, puis le `@`.
 */
export function coordonneesDepuisLienGoogle(url: string): Coordonnees | null {
  let decode = url;
  try {
    decode = decodeURIComponent(url);
  } catch {
    // Un `%` isolé : on lit le lien tel quel.
  }

  const repere = REPERE_DE_FICHE.exec(decode);
  if (repere) return valider(repere[1], repere[2]);

  let parametres: URLSearchParams | null = null;
  try {
    parametres = new URL(url).searchParams;
  } catch {
    parametres = null;
  }
  for (const cle of ['q', 'query', 'll', 'center', 'destination']) {
    const valeur = parametres?.get(cle);
    const paire = valeur ? PAIRE_EN_PARAMETRE.exec(valeur) : null;
    if (paire) return valider(paire[1], paire[2]);
  }

  const arobase = PAIRE_APRES_AROBASE.exec(decode);
  if (arobase) return valider(arobase[1], arobase[2]);
  return null;
}

const HOTES_OSM = new Set(['www.openstreetmap.org', 'openstreetmap.org']);
const HOTES_APPLE = new Set(['maps.apple.com']);
const VUE_OSM = /^#map=\d{1,2}\/(-?\d{1,2}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)/;

/**
 * Un lien OpenStreetMap ou Plans d'Apple : les coordonnées y sont écrites, aucune requête n'est
 * nécessaire — et aucune n'est faite (ces hôtes ne sont pas suivis par le serveur). Sur OSM, le
 * MARQUEUR (`mlat`/`mlon`) prime sur le centre de la vue (`#map=zoom/lat/lon`), comme le repère
 * d'une fiche Google prime sur son `@`.
 */
function coordonneesDepuisLienOsmOuApple(url: URL): Coordonnees | null {
  const hote = url.hostname.toLowerCase();
  if (HOTES_OSM.has(hote)) {
    const mlat = url.searchParams.get('mlat');
    const mlon = url.searchParams.get('mlon');
    if (mlat && mlon) return valider(mlat, mlon);
    const vue = VUE_OSM.exec(url.hash);
    return vue ? valider(vue[1], vue[2]) : null;
  }
  if (HOTES_APPLE.has(hote)) {
    for (const cle of ['ll', 'coordinate', 'q', 'sll']) {
      const valeur = url.searchParams.get(cle);
      const paire = valeur ? PAIRE_EN_PARAMETRE.exec(valeur) : null;
      if (paire) return valider(paire[1], paire[2]);
    }
  }
  return null;
}

const URL_DANS_LE_TEXTE = /https?:\/\/[^\s<>"]+/i;
const URI_GEO = /^geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i;
const DECIMAL_POINT = /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/;
const DECIMAL_VIRGULE = /^(-?\d{1,2},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/;
const CODE_COMPLET_DANS_LE_TEXTE = /(?:^|\s)([23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7})(?=\s|,|$)/i;
const CODE_COURT_DANS_LE_TEXTE = /(?:^|\s)((?:[23456789CFGHJMPQRVWX]{2}){1,3}\+[23456789CFGHJMPQRVWX]{2,7})(?=\s|,|$)/i;

/**
 * Une composante en degrés-minutes-secondes : `14°43'00.1"N`, `17°28′03,6″ W`, `14° 43.002' N` —
 * ou en degrés DÉCIMAUX suivis de `°`, à la façon de Plans d'Apple : `14,7167° N`, `17.4677° O`.
 * L'hémisphère se lit APRÈS (forme de Google) ou AVANT (`N 14° 43' 0.1"`) — jamais les deux à la
 * fois : lue d'un seul motif, la lettre d'une composante était prise pour la suite de la précédente.
 */
const DEGRES = "(\\d{1,3}(?:[.,]\\d+)?)\\s*°\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*['′’])?\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*(?:[\"″”]|''))?";
const DMS_HEMISPHERE_APRES = new RegExp(`${DEGRES}\\s*([NSEWO])?`, 'gi');
const DMS_HEMISPHERE_AVANT = new RegExp(`([NSEWO])\\s*${DEGRES}`, 'gi');

function lireDms(saisie: string): Coordonnees | null {
  const avant = /^[NSEWO]\s*\d/i.test(saisie);
  const composantes = [...saisie.matchAll(avant ? DMS_HEMISPHERE_AVANT : DMS_HEMISPHERE_APRES)].map((m) =>
    avant
      ? { hemisphere: m[1], degres: m[2], minutes: m[3], secondes: m[4] }
      : { hemisphere: m[4], degres: m[1], minutes: m[2], secondes: m[3] },
  );
  if (composantes.length !== 2) return null;

  const valeurs = composantes.map((c) => {
    const hemisphere = (c.hemisphere ?? '').toUpperCase();
    const minutes = c.minutes ? Number(c.minutes.replace(',', '.')) : 0;
    const secondes = c.secondes ? Number(c.secondes.replace(',', '.')) : 0;
    if (minutes >= 60 || secondes >= 60) return null;
    const degres = Number(c.degres.replace(',', '.'));
    // Des degrés décimaux ne se complètent pas de minutes : « 14,5° 30' » n'a pas de sens.
    if (!Number.isInteger(degres) && (c.minutes || c.secondes)) return null;
    const valeur = degres + minutes / 60 + secondes / 3600;
    return { hemisphere, valeur: ['S', 'W', 'O'].includes(hemisphere) ? -valeur : valeur };
  });
  if (valeurs.some((v) => v === null)) return null;
  const [a, b] = valeurs as { hemisphere: string; valeur: number }[];
  // L'ordre usuel est latitude puis longitude ; une longitude (E/W/O) en tête l'inverse.
  const inverse = ['E', 'W', 'O'].includes(a.hemisphere) || ['N', 'S'].includes(b.hemisphere);
  const [lat, lng] = inverse ? [b.valeur, a.valeur] : [a.valeur, b.valeur];
  return valider(Number(lat.toFixed(7)), Number(lng.toFixed(7)));
}

/**
 * @param reference le centre de la ville choisie — il rapporte un Plus Code COURT à sa cellule.
 *                  Sans elle, un code court est rendu tel quel (`plus-code-court-sans-reference`).
 */
export function reconnaitrePosition(saisie: string, reference?: PointPlusCode | null): PositionReconnue {
  const texte = saisie.trim();
  if (texte === '') return { kind: 'inconnu' };

  const lien = URL_DANS_LE_TEXTE.exec(texte);
  if (lien) {
    const url = lien[0].replace(/[).,;]+$/, '');
    let analyse: URL;
    try {
      analyse = new URL(url);
    } catch {
      return { kind: 'inconnu' };
    }
    const hote = analyse.hostname.toLowerCase();
    if (HOTES_OSM.has(hote) || HOTES_APPLE.has(hote)) {
      const lu = coordonneesDepuisLienOsmOuApple(analyse);
      return lu ? { kind: 'coordonnees', source: 'lien', ...lu } : { kind: 'inconnu' };
    }
    if (!HOTES_GOOGLE.has(hote)) return { kind: 'inconnu' };
    const lu = coordonneesDepuisLienGoogle(url);
    if (lu) return { kind: 'coordonnees', source: 'lien', ...lu };
    return { kind: 'lien-a-resoudre', url };
  }

  const geo = URI_GEO.exec(texte);
  if (geo) {
    const lu = valider(geo[1], geo[2]);
    return lu ? { kind: 'coordonnees', source: 'geo', ...lu } : { kind: 'inconnu' };
  }

  const complet = CODE_COMPLET_DANS_LE_TEXTE.exec(texte);
  if (complet) {
    const lu = decoderPlusCode(complet[1]);
    return lu ? { kind: 'coordonnees', source: 'plus-code', ...lu } : { kind: 'inconnu' };
  }
  const court = CODE_COURT_DANS_LE_TEXTE.exec(texte);
  if (court) {
    const code = court[1].toUpperCase();
    if (!reference) return { kind: 'plus-code-court-sans-reference', code };
    const lu = recupererPlusCodeCourt(code, reference);
    return lu ? { kind: 'coordonnees', source: 'plus-code-court', ...lu } : { kind: 'inconnu' };
  }

  const point = DECIMAL_POINT.exec(texte);
  if (point) {
    const lu = valider(point[1], point[2]);
    if (lu) return { kind: 'coordonnees', source: 'decimal', ...lu };
  }
  const virgule = DECIMAL_VIRGULE.exec(texte);
  if (virgule) {
    const lu = valider(virgule[1].replace(',', '.'), virgule[2].replace(',', '.'));
    if (lu) return { kind: 'coordonnees', source: 'decimal', ...lu };
  }

  const dms = lireDms(texte);
  if (dms) return { kind: 'coordonnees', source: 'dms', ...dms };

  return { kind: 'inconnu' };
}
