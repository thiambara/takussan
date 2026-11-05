import { valeurBornee } from '@/hooks/useVueDansLUrl';

/** TCK-171, TCK-590 — les onglets de la liste des visites (« Non attribuées » : le personnel seul). */
export const ONGLETS_DES_VISITES = ['unassigned', 'requested', 'confirmed', 'past', 'cancelled'] as const;
export type OngletDesVisites = (typeof ONGLETS_DES_VISITES)[number];

/**
 * TCK-1736 (P168.03) — l'onglet que porte `?tab=`, borné aux onglets ouverts ; « Demandées » sinon.
 *
 * TCK-2479 — sorti de `VisitsList` pour que la garde du menu (`a-traiter-lu-par-sa-page.test.ts`)
 * éprouve CE lecteur-ci, celui que la page appelle : la pastille « À traiter » des visites vise
 * `?tab=requested`.
 */
export function ongletDesVisites(
  params: Pick<URLSearchParams, 'get' | 'toString'>,
  personnel: boolean,
): OngletDesVisites {
  const ouverts = personnel ? ONGLETS_DES_VISITES : ONGLETS_DES_VISITES.filter((k) => k !== 'unassigned');
  return valeurBornee(params, 'tab', ouverts) ?? 'requested';
}
