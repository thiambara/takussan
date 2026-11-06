import type { NavCounterKey } from './types';

/**
 * TCK-2479 (ADR-0089 §5) — la bande « À traiter » au-dessus du menu : une fonction pure des entrées
 * RENDUES, des compteurs et de la priorité du persona.
 *
 * - Elle ne lit que les entrées que la barre rend, non cadenassées : exactement celles dont le
 *   compteur est sondé (`countersToPoll`, TCK-377). Elle ne demande aucun compteur de plus.
 * - `priorites` est une LISTE BLANCHE et un ORDRE : un compteur que le persona ne cite pas garde son
 *   badge dans le menu, mais n'est pas « à traiter » pour lui (les visites d'un client attendent
 *   l'agence, pas lui).
 * - 0 vaut « rien à traiter » : le chargement et l'erreur arrivent ici déjà ramenés à 0.
 * - Elle ne touche pas au menu : aucune entrée ne change de place selon un compteur.
 */
export interface EntreeComptee {
  readonly href: string;
  readonly counterKey?: NavCounterKey;
  readonly hrefATraiter?: string;
  readonly locked?: boolean;
}

export interface PastilleATraiter {
  readonly cle: NavCounterKey;
  readonly nombre: number;
  /** La page filtrée sur ce qui attend (`hrefATraiter`), sinon la page de l'entrée. */
  readonly href: string;
}

/** Quatre pastilles au plus ; le reste derrière « +N ». */
export const PASTILLES_VISIBLES = 4;

export function pastillesATraiter(
  entrees: readonly EntreeComptee[],
  comptes: Readonly<Partial<Record<NavCounterKey, number>>>,
  priorites: readonly NavCounterKey[],
): { readonly visibles: readonly PastilleATraiter[]; readonly autres: readonly PastilleATraiter[] } {
  const pastilles: PastilleATraiter[] = [];
  for (const cle of priorites) {
    const entree = entrees.find((e) => e.counterKey === cle && !e.locked);
    const nombre = comptes[cle] ?? 0;
    if (!entree || !(nombre > 0)) continue;
    pastilles.push({ cle, nombre, href: entree.hrefATraiter ?? entree.href });
  }
  return { visibles: pastilles.slice(0, PASTILLES_VISIBLES), autres: pastilles.slice(PASTILLES_VISIBLES) };
}
