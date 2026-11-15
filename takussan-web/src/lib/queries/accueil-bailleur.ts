'use client';

import { usePaymentsHistory, type UsePaymentsHistoryParams } from '@/lib/queries/payments';

/**
 * TCK-2624 (lot 2) — les lectures propres à l'accueil du bailleur. Les autres files sont celles des
 * écrans qui les portent déjà, sous LEUR clé (un geste de l'accueil relit la même famille) :
 *  - visites à confirmer : `useVisitesAConfirmer` (`lib/queries/accueil`, la file de la pastille) ;
 *  - devis à valider, en cours sur ses biens : `useDevisAttendantLeBailleur`, `useEnCoursDuBailleur`
 *    (`lib/queries/maintenance-signalement`, TCK-2654).
 */

/** Les loyers en retard montrés en rangées (la maquette en montre trois). */
export const LOYERS_EN_RETARD_MONTRES = 3;

/**
 * « Loyers en retard » : les échéances impayées DONT IL EST LE BAILLEUR (`filter[landlord_id]`), la
 * règle *Impayé* partagée (`days_late_min ≥ 1`, réservations écartées par l'API), la plus en retard
 * d'abord. ⚠ Le filtre `landlord_id` est nécessaire : l'historique rend aussi au lecteur les échéances
 * dont il est le LOCATAIRE — un bailleur qui loue lui-même un logement y verrait son propre loyer.
 * Sans `reminders` : la dernière relance est réservée à l'agence (ticket, hors périmètre).
 */
export function parametresDesLoyersEnRetard(landlordId: number): UsePaymentsHistoryParams {
  return {
    days_late_min: 1,
    landlord_id: landlordId,
    sort: '-days_late',
    include: ['payer', 'property'],
    page: 1,
    per_page: LOYERS_EN_RETARD_MONTRES,
  };
}

export function useLoyersEnRetard(landlordId: number, enabled: boolean) {
  return usePaymentsHistory({ ...parametresDesLoyersEnRetard(landlordId), enabled });
}
