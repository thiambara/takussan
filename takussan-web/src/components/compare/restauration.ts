import { COMPARE_MAX_IDS, type ComparePreviews } from '@/lib/compare';

export interface SelectionComparateur {
  readonly ids: readonly number[];
  readonly previews: ComparePreviews;
}

/**
 * Ce que « Annuler » rend après « Vider » (TCK-561) — la sélection d'avant, SANS écraser ce que
 * le visiteur a choisi entre-temps.
 *
 * La première version restaurait l'instantané par `replace()` : un bien ajouté entre les deux
 * gestes disparaissait sans un mot. La règle, désormais :
 *
 * - ce qui est dans la sélection COURANTE reste — c'est le geste le plus récent du visiteur ;
 * - l'instantané revient dans la place qui reste sous le plafond, dans son ordre d'origine ;
 * - ce qui n'a pas pu revenir est RENDU (`ecartes`), pour être dit — jamais perdu en silence ;
 * - l'ordre final suit l'instantané, puis les ajouts : les biens d'avant retrouvent leur place.
 *
 * Les aperçus des DEUX origines sont gardés (l'instantané nomme les biens d'avant, la sélection
 * courante ceux ajoutés depuis) ; `writeCompare` élague ceux dont l'id n'est pas retenu.
 */
export function fusionnerRestauration(
  sauvegarde: SelectionComparateur,
  courante: SelectionComparateur,
  max: number = COMPARE_MAX_IDS,
): { ids: number[]; previews: ComparePreviews; ecartes: number[] } {
  const courants = new Set(courante.ids);
  const aRetablir = sauvegarde.ids.filter((id) => !courants.has(id));
  const place = Math.max(0, max - courante.ids.length);
  const retablis = new Set(aRetablir.slice(0, place));
  const ecartes = aRetablir.slice(place);

  const ids = [
    ...sauvegarde.ids.filter((id) => retablis.has(id) || courants.has(id)),
    ...courante.ids.filter((id) => !sauvegarde.ids.includes(id)),
  ];

  return {
    ids,
    previews: { ...sauvegarde.previews, ...courante.previews },
    ecartes,
  };
}
