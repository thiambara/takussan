import type { PropertyListItem } from '@/types/property';
import { placementDe } from '@/components/boost/lecture-recherche';

/**
 * TCK-2500 — la suite des cartes d'UNE page de la liste, emplacements sponsorisés insérés.
 *
 * Le contrat est celui de l'API (`GET /api/public/properties/search`, notes de TCK-2500) : chaque
 * entrée de `sponsored` porte `position`, son rang (base 0) dans la suite AFFICHÉE une fois les
 * emplacements insérés — `0`, `11`, `22`… Le front insère `sponsored[k]` à l'index `position`, dans
 * l'ordre de `sponsored` : `[S0, d0…d9, S1, d10…d19, S2, d20…]`.
 *
 * ⚠ **La position ne se recalcule JAMAIS ici.** C'est l'API qui sait combien de cartes une page
 * porte, places réservées comprises, et qui garantit qu'aucune position rendue ne tombe hors de la
 * suite (« jamais deux de suite »). Le seul cas que le front tranche est une réponse qui ne porte
 * pas `position` (API antérieure à TCK-2500) : l'emplacement garde alors sa place d'avant, en tête,
 * à la suite des emplacements déjà posés.
 *
 * Une position au-delà de la suite (impossible sous le contrat) pose l'emplacement à la fin, plutôt
 * que de le perdre : un emplacement servi est une impression comptée (ADR-0061 §10).
 */
export type CarteDeLaListe =
  | { readonly genre: 'organique'; readonly bien: PropertyListItem; readonly rang: number }
  | { readonly genre: 'sponsorise'; readonly bien: PropertyListItem; readonly rang: number };

/** La position d'insertion rendue par l'API, ou `null` si la réponse n'en porte pas. */
export function positionDe(bien: unknown): number | null {
  const valeur = (bien as { position?: unknown } | null)?.position;
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 ? valeur : null;
}

export function insererEmplacements(
  organiques: readonly PropertyListItem[],
  sponsorises: readonly PropertyListItem[],
): CarteDeLaListe[] {
  const suite: CarteDeLaListe[] = organiques.map((bien, rang) => ({ genre: 'organique', bien, rang }));
  let enTete = 0;
  sponsorises.forEach((bien, rang) => {
    const position = positionDe(bien);
    const index = position === null ? enTete : Math.min(position, suite.length);
    suite.splice(index, 0, { genre: 'sponsorise', bien, rang });
    if (position === null) enTete += 1;
  });
  return suite;
}

/** Une page de la liste, telle que la suite continue la lit. */
export interface PageDeLaListe {
  /** `meta.current_page`. */
  readonly numero: number;
  /** `data` : places réservées (page 1) puis biens organiques. */
  readonly organiques: readonly PropertyListItem[];
  /** `sponsored`, chaque entrée portant sa `position`. */
  readonly sponsorises: readonly PropertyListItem[];
}

export type CarteDeLaSuite = CarteDeLaListe & { readonly page: number };

/**
 * TCK-2499 / TCK-2500 (revue adverse du 2026-11-09) — la suite CONTINUE que voit le lecteur : les
 * pages chargées par « Voir N biens de plus », mises bout à bout, chacune avec ses emplacements.
 *
 * Deux règles d'AFFICHAGE, que l'API ne peut pas tenir seule (elle sert une page à la fois) :
 *
 * 1. **Un bien n'est montré qu'une fois** dans la suite. L'API ne double jamais un résultat de la
 *    MÊME page par un emplacement (amendement d'ADR-0061 §7), mais d'une page à l'autre, si : relevé
 *    sur cinq pages, un garage sponsorisé en 22 puis en 43 et organique en 181, un studio organique
 *    en 38 puis sponsorisé en 108 et 129, une place réservée en 1 revenue sponsorisée en 140. Le
 *    PREMIER affichage gagne, quel que soit son genre ; un emplacement retiré n'est pas remplacé.
 * 2. **La première page ne s'ouvre pas sur trois places payées** : quand des places réservées
 *    (« En vedette ») ouvrent la liste, l'emplacement de TÊTE (position 0 — ou sans position, que le
 *    contrat d'avant posait en tête) n'est pas inséré. Les suivants gardent leurs positions (11,
 *    22) : elles comptent dans la suite affichée, et `insererEmplacements` les y pose telles quelles.
 *
 * ⚠ Un emplacement que le front ne montre pas a pu être compté comme impression par l'API
 * (`BoostStatsRecorder`, une par emplacement SERVI) : écart signalé à la session.
 */
export function suiteDesPages(pages: readonly PageDeLaListe[]): CarteDeLaSuite[] {
  const montres = new Set<number>();
  const suite: CarteDeLaSuite[] = [];
  for (const page of pages) {
    const ouvreSurUnePlaceReservee =
      page.numero === 1 && page.organiques.length > 0 && placementDe(page.organiques[0]) === 'reserved';
    const sponsorises = ouvreSurUnePlaceReservee
      ? page.sponsorises.filter((bien) => {
          const position = positionDe(bien);
          return position !== null && position > 0;
        })
      : page.sponsorises;
    for (const carte of insererEmplacements(page.organiques, sponsorises)) {
      if (montres.has(carte.bien.id)) continue;
      montres.add(carte.bien.id);
      suite.push({ ...carte, page: page.numero });
    }
  }
  return suite;
}

