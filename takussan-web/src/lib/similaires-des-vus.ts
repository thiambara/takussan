import type { PropertyListItem } from '@/types/property';

/**
 * La rangée « Récemment consultés » de l'accueil, complétée par des biens SIMILAIRES — retour du
 * porteur du 2026-10-10 : avec deux biens consultés, la rangée de sept cartes se réduisait à deux
 * cartes perdues à gauche de l'écran.
 *
 * La rangée vise `CIBLE_DE_LA_RANGEE` cartes. Les biens consultés passent d'abord, dans leur ordre
 * (le plus récent en tête) ; le reste se complète avec les similaires des `SOURCES_MAX` biens
 * consultés les plus récents, lus sur l'endpoint existant `GET /public/properties/{slug}/similar`.
 */
export const CIBLE_DE_LA_RANGEE = 12;
export const SOURCES_MAX = 3;

/**
 * Fusionne les listes de similaires À TOUR DE RÔLE (le 1er de chaque source, puis le 2e…), pour
 * que le bien consulté en dernier ne monopolise pas la rangée. Un bien déjà consulté, ou déjà
 * retenu par une autre source, n'apparaît qu'une fois.
 */
export function fusionnerSimilaires(
  vus: readonly PropertyListItem[],
  listes: readonly (readonly PropertyListItem[])[],
  manque: number,
): PropertyListItem[] {
  const pris = new Set(vus.map((b) => b.id));
  const retenus: PropertyListItem[] = [];
  const longueur = Math.max(0, ...listes.map((l) => l.length));
  for (let rang = 0; rang < longueur && retenus.length < manque; rang++) {
    for (const liste of listes) {
      const bien = liste[rang];
      if (!bien || pris.has(bien.id)) continue;
      pris.add(bien.id);
      retenus.push(bien);
      if (retenus.length >= manque) break;
    }
  }
  return retenus;
}
