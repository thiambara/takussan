'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useOwnerStatement, usePaymentsHistory, type UsePaymentsHistoryParams } from '@/lib/queries/payments';
import type { PaginatedResponse } from '@/types/api';
import type { OwnerStatement, PaymentHistoryRow, Payout } from '@/types/invoice';

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
 * Sans `reminders` : `include=reminders` reste réservé à l'agence (TCK-2915, ADR-0105) — la dernière
 * relance que le bailleur lit vient de son relevé (`useRelancesDesLoyers`, TCK-2850).
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

/**
 * TCK-2850 — les mois (`AAAA-MM`) des échéances montrées, sans doublon, dans l'ordre : un relevé par mois,
 * trois au plus (la file en montre trois, `LOYERS_EN_RETARD_MONTRES`).
 */
export function moisDesLoyers(rows: readonly PaymentHistoryRow[]): string[] {
  const mois: string[] = [];
  for (const row of rows) {
    const m = row.due_date?.slice(0, 7);
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && !mois.includes(m)) mois.push(m);
  }
  return mois.slice(0, LOYERS_EN_RETARD_MONTRES);
}

/**
 * TCK-2850 (maquette e2, « relancé par l'agence le 8 nov. ») — la dernière relance NOTÉE par l'agence de
 * chaque loyer en retard montré. Le bailleur ne lit pas `include=reminders` (réservé à l'agence) : TCK-2915
 * (ADR-0105, amendement du 2026-11-15) lui sert `{at, channel, by_name}` dans SON relevé, par bien, pour les
 * échéances en retard de la période — d'où un relevé par mois d'échéance (`useOwnerStatement`, la clé de
 * l'écran du relevé). Rien de lu (chargement, panne, bien absent du relevé, aucune relance) : `null`, et la
 * rangée ne dit rien de la relance — jamais « jamais relancé » chez le bailleur.
 *
 * ⚠ Le relevé est celui de l'agence ACTIVE du bailleur : un loyer d'une autre agence ne dit pas sa relance.
 */
export function useRelancesDesLoyers(rows: readonly PaymentHistoryRow[]): (row: PaymentHistoryRow) => string | null {
  const mois = moisDesLoyers(rows);
  // Trois emplacements FIXES (règle des hooks) ; un mois vide n'est pas lu (`useOwnerStatement` le refuse).
  const releves = [useOwnerStatement(mois[0] ?? ''), useOwnerStatement(mois[1] ?? ''), useOwnerStatement(mois[2] ?? '')];
  const parMois = new Map<string, OwnerStatement>();
  mois.forEach((m, i) => {
    const lu = releves[i]?.data?.data;
    if (lu) parMois.set(m, lu);
  });
  return (row) => {
    const releve = row.due_date ? parMois.get(row.due_date.slice(0, 7)) : undefined;
    const bien = row.property_id ?? row.property?.id ?? null;
    if (!releve || bien === null) return null;
    const ligne = releve.properties?.find((p) => p.property_id === bien);
    return ligne?.reminders?.[0]?.at ?? null;
  };
}

/**
 * TCK-2850 (maquette e2, « Prochain reversement · 15 nov. ») — le premier reversement À VENIR au bailleur :
 * `payee_role=landlord` (jamais une restitution de caution ni une facture de prestataire, TCK-595 AC4 bis),
 * `filter[upcoming]` (en attente d'approbation, planifié ou en cours, `PayoutStatus::upcoming()`), le plus
 * proche d'abord — le filtre de `fetchUpcomingOwnerPayouts` (onglet « Reversements »). Sous la famille
 * `payouts` : un geste sur un reversement la relit.
 */
export function useProchainReversement(landlordId: number) {
  return useApiQuery<PaginatedResponse<Payout>>(
    ['payouts', 'prochain-du-bailleur', landlordId],
    '/api/payouts',
    {
      params: {
        // Les champs de `fetchUpcomingOwnerPayouts` (onglet « Reversements »), éprouvés contre l'API.
        fields: { payouts: ['id', 'reference_number', 'landlord_id', 'status', 'net_amount', 'currency', 'scheduled_at', 'created_at'] },
        filter: { landlord_id: landlordId, payee_role: 'landlord', upcoming: 1 },
        sort: ['scheduled_at', '-created_at'],
        page: 1,
        per_page: 1,
      },
    },
  );
}
