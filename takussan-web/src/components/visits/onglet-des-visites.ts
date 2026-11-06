import { valeurBornee } from '@/hooks/useVueDansLUrl';
import type { VisitStatus } from '@/types/visit';

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

/** Ce que chaque onglet demande à `/api/property-visits` : le statut et les bornes de date. */
export interface BornesDeLOnglet {
  readonly status?: VisitStatus;
  readonly scheduled_at_min?: string;
  readonly scheduled_at_max?: string;
  readonly unassigned?: boolean;
}

/**
 * TCK-2479 (revue, I2) — le PÉRIMÈTRE de chaque onglet, à l'instant `maintenant` (ISO). Sorti de
 * `VisitsList` pour que le compteur du menu (`usePendingVisitsCount`) compte EXACTEMENT ce que
 * l'onglet « Demandées » montre : il comptait toute visite `scheduled`, celles d'hier comprises, que
 * l'onglet range dans « Passées » — une pastille vraie pour toujours, sur une page qui ne la montrait
 * jamais (aucune tâche ne fait sortir une visite passée de `scheduled`).
 */
export function bornesDeLOnglet(onglet: OngletDesVisites, maintenant: string): BornesDeLOnglet {
  switch (onglet) {
    case 'unassigned':
      return { status: 'scheduled', unassigned: true, scheduled_at_min: maintenant };
    case 'requested':
      return { status: 'scheduled', scheduled_at_min: maintenant };
    case 'confirmed':
      return { status: 'confirmed', scheduled_at_min: maintenant };
    case 'past':
      return { scheduled_at_max: maintenant };
    case 'cancelled':
      return { status: 'cancelled' };
  }
}

/**
 * TCK-867 (P02.10) — l'instant arrondi à la minute (vers le bas) : il entre dans la clé de cache des
 * listes, et à la milliseconde chaque montage en faisait des clés neuves.
 */
export function debutDeLaMinute(instant: Date): string {
  const arrondi = new Date(instant.getTime());
  arrondi.setUTCSeconds(0, 0);
  return arrondi.toISOString();
}
