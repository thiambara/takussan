import { ApiError } from '@/lib/api';

/**
 * TCK-2778 — le 409 d'une agence qui n'encaisse pas ses pénalités de retard en ligne : le lien de la
 * pénalité seule est refusé, la relance notée reste permise (un message sans lien). Module à part :
 * la liste des baux le lit sans charger la feuille de relance, importée à la demande.
 */
export const PENALITE_HORS_LIGNE = 'payment.late_fee_not_collected_online';

export function estPenaliteHorsLigne(erreur: unknown): boolean {
  return (
    erreur instanceof ApiError &&
    erreur.status === 409 &&
    (erreur.data as { code?: unknown } | null)?.code === PENALITE_HORS_LIGNE
  );
}
