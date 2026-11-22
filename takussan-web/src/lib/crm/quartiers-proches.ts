/**
 * TCK-2890 — les quartiers proches de ceux qu'un client cherche (maquette `app-clients` e2 et e4 :
 * « + Sacré-Cœur · + Point E · + Liberté 6 »). Calcul à l'écran, sur la liste des quartiers d'une
 * ville (`GET /api/public/geo/neighborhoods?city=`), qui sert déjà latitude et longitude.
 *
 *  · Les quartiers choisis sont des noms libres : ils se retrouvent dans le référentiel sans tenir
 *    compte des accents ni de la casse (« fann » = « Fann »).
 *  · Seuls les quartiers APPROUVÉS se suggèrent (la route sert aussi les propositions du lecteur).
 *  · Distance à vol d'oiseau (haversine) au plus proche des quartiers choisis ; trois au plus, du plus
 *    proche au plus lointain ; jamais un quartier déjà choisi.
 *  · Aucun quartier choisi n'a de coordonnées : aucune suggestion.
 *
 * Pur, sans directive.
 */

export interface QuartierSitue {
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly status: string;
}

export const SUGGESTIONS_MAX = 3;

/** Un nom replié : sans accents ni casse, espaces resserrés. */
export function plierLeNom(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
    .replace(/[\s-]+/g, ' ')
    .trim();
}

const RAYON_TERRE_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** La distance à vol d'oiseau, en kilomètres. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const situe = (q: QuartierSitue): q is QuartierSitue & { latitude: number; longitude: number } =>
  typeof q.latitude === 'number' && typeof q.longitude === 'number' && Number.isFinite(q.latitude) && Number.isFinite(q.longitude);

/** Les noms des quartiers à suggérer, du plus proche au plus lointain. */
export function quartiersProches(choisis: readonly string[], quartiers: readonly QuartierSitue[], max = SUGGESTIONS_MAX): string[] {
  const pris = new Set(choisis.map(plierLeNom));
  const reperes = quartiers.filter((q) => pris.has(plierLeNom(q.name))).filter(situe);
  if (reperes.length === 0) return [];
  return quartiers
    .filter((q) => q.status === 'approved' && !pris.has(plierLeNom(q.name)))
    .filter(situe)
    .map((q) => ({ nom: q.name, d: Math.min(...reperes.map((r) => distanceKm(r, q))) }))
    .sort((a, b) => a.d - b.d || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, max)
    .map((x) => x.nom);
}

/**
 * La ville où chercher les quartiers : la première des villes recherchées que le référentiel connaît,
 * sinon Dakar (le marché de la plateforme : la création courte ne demande pas de ville). `null` si
 * le référentiel ne connaît ni l'une ni l'autre.
 */
export function villeDesQuartiers<V extends { readonly id: number; readonly name: string; readonly slug: string }>(villesCherchees: readonly string[], villes: readonly V[]): V | null {
  for (const nom of villesCherchees) {
    const v = villes.find((x) => plierLeNom(x.name) === plierLeNom(nom));
    if (v) return v;
  }
  return villes.find((x) => x.slug === 'dakar') ?? null;
}
