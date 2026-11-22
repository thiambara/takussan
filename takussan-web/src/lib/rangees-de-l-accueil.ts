/**
 * Ce que l'accueil demande à `GET /api/public/properties/discovery` — **neutre, donc lisible des
 * deux côtés de la frontière** (TCK-432).
 *
 * ⚠️ Ce module minuscule existe pour une raison précise : `useHomepageDiscovery.ts` porte
 * `'use client'`, et **tout** ce qu'un module client exporte devient une *référence client* — une
 * constante y comprise. Un composant serveur qui en importerait `HOMEPAGE_DISCOVERY_PER_ROW`
 * n'obtiendrait pas le nombre 12 mais un proxy qui lève à la lecture. Recopier la valeur dans le
 * module serveur serait la réponse facile, et ce dépôt paie ailleurs, régulièrement, le prix des
 * valeurs recopiées : elles sont justes le jour où on les écrit.
 */

/**
 * Une valeur pour les quatre rangées — l'endpoint la plafonne à 20 (422 au-delà).
 *
 * Le rendu serveur et la relance client demandent le MÊME nombre. Deux valeurs différentes ne
 * casseraient rien de visible : elles feraient simplement que la relance, quand elle a lieu,
 * remplace douze cartes par huit sous les yeux du visiteur, sur les trois rangées qui n'ont
 * pourtant aucune raison de changer.
 */
export const HOMEPAGE_DISCOVERY_PER_ROW = 12;

/** Ce que les rangées de l'accueil lisent d'un bien pour se dédoublonner : son identifiant. */
interface AvecIdentifiant {
  readonly id: number;
}

export interface RangeesSansDoublon<T extends AvecIdentifiant> {
  readonly near: readonly T[];
  readonly featured: readonly T[];
  readonly latest: readonly T[];
}

/**
 * TCK-2495 — les TROIS rangées de l'accueil (« À <ville> », « Coup de cœur », « Tout juste publié »),
 * sans qu'un bien apparaisse dans deux d'entre elles.
 *
 * Le serveur dédoublonne déjà `near` et `latest` entre elles (TCK-247), mais **pas** `featured`, qu'il
 * tient pour curée. La priorité n'est pas l'ordre d'affichage, et c'est voulu :
 *
 * 1. **`featured` reste ENTIÈRE.** C'est un emplacement payé : l'API compte une impression par bien
 *    qu'elle y SERT (`BoostStatsRecorder::impressions`, ADR-0061 §10). En retirer une carte ferait
 *    compter une impression pour un bien que personne n'a vu.
 * 2. **`near`** perd les biens de `featured`.
 * 3. **`latest`** perd ceux de `featured` et de `near`.
 *
 * Une rangée organique peut donc maigrir d'autant de cartes que la vedette en reprend ; elle en compte
 * {@link HOMEPAGE_DISCOVERY_PER_ROW} au départ, ce qui laisse de quoi remplir l'écran.
 */
export function rangeesSansDoublon<T extends AvecIdentifiant>(rangees: {
  readonly near: readonly T[];
  readonly featured: readonly T[];
  readonly latest: readonly T[];
}): RangeesSansDoublon<T> {
  const vus = new Set<number>();
  const garder = (biens: readonly T[]): T[] =>
    biens.filter((bien) => {
      if (vus.has(bien.id)) return false;
      vus.add(bien.id);
      return true;
    });
  const featured = garder(rangees.featured);
  const near = garder(rangees.near);
  const latest = garder(rangees.latest);
  return { near, featured, latest };
}
