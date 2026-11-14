'use client';

/**
 * TCK-595 (AD16, AD17) — le pilotage d'une agence : performance d'équipe et balance âgée.
 *
 * Les deux points exigent `reports.view_agency` à l'agence (`AgencyPolicy::viewReports`) ; la
 * performance d'équipe est en plus réservée aux agences `standard`. Ce ne sont pas des listes
 * spatie : des agrégats, sans `fields[]` à poser.
 *
 * ⚠️ Les chemins portent `/api` : `useApiQuery` ne l'ajoute PAS.
 */

import { useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse } from '@/types/api';
import { cheminApi } from '@/lib/chemin-api';

export const AGING_BUCKETS = ['1_30', '31_60', '61_90', '90_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export type AgingGroupBy = 'tenant' | 'landlord';

export interface AgingCell {
  readonly count: number;
  readonly amount: number;
}

export interface AgingBalance {
  readonly as_of: string;
  readonly group_by: AgingGroupBy;
  readonly buckets: Record<AgingBucket, AgingCell>;
  readonly total: AgingCell;
  readonly rows: ReadonlyArray<{
    readonly id: number | null;
    readonly name: string | null;
    readonly buckets: Record<AgingBucket, AgingCell>;
    readonly total: AgingCell;
  }>;
  readonly deposits_held: {
    readonly total: number;
    readonly by_landlord: ReadonlyArray<{ readonly landlord_id: number | null; readonly name: string | null; readonly amount: number }>;
  };
}

export interface TeamPerformanceRow {
  readonly user_id: number;
  readonly name: string | null;
  readonly leases_signed: number;
  readonly sales_signed: number;
  readonly visits_completed: number;
  readonly customers_added: number;
  readonly commissions_earned: number;
  readonly properties_managed: number;
  readonly tasks_overdue: number;
  /** TCK-2626 — les demandes de contact que l’agent a marquées traitées (`handled_by_id`) dans le mois. */
  readonly leads_handled?: number;
}

export interface TeamPerformance {
  readonly period: string;
  readonly agents: readonly TeamPerformanceRow[];
}

export const agencyReportingKeys = {
  aging: (agencyId: number | undefined, groupBy: AgingGroupBy) =>
    ['agencies', agencyId, 'finance', 'aging', groupBy] as const,
  teamPerformance: (agencyId: number, period: string) =>
    ['agencies', agencyId, 'team-performance', period] as const,
  financeSummary: (agencyId: number | undefined, period: string) =>
    ['agencies', agencyId, 'finance', 'summary', period] as const,
};

/** `GET /api/agencies/{agency}/finance/aging` — l'onglet « Impayés » de `/app/agency/finances`. */
export function useAgingBalance(agencyId: number | undefined, groupBy: AgingGroupBy) {
  return useApiQuery<ApiResponse<AgingBalance>>(
    agencyReportingKeys.aging(agencyId, groupBy),
    cheminApi`/api/agencies/${agencyId}/finance/aging`,
    { params: { extra: { group_by: groupBy } }, enabled: typeof agencyId === 'number' },
  );
}

/** Un compte et son montant, tels que la synthèse les rend. */
export interface CompteEtMontant {
  readonly count: number;
  readonly amount: number;
}

/**
 * TCK-2657 — `GET /api/agencies/{agency}/finance/summary?period=YYYY-MM`, le point du mois de
 * « Argent » (TCK-2659). `collected` porte sur le mois civil demandé (et `previous_amount` sur celui
 * d'avant) ; `overdue`, les reversements et les factures sont l'état AU JOUR (`as_of`), quel que soit
 * le mois : la tuile « Impayés » ne suit pas le libellé du mois. 422 `reporting.invalid_period` sur
 * un mois mal formé ; 403 sans `reports.view_agency`.
 */
export interface FinanceSummary {
  readonly period: string;
  readonly as_of: string;
  readonly currency: string;
  readonly collected: CompteEtMontant & { readonly previous_amount: number };
  readonly overdue: CompteEtMontant & {
    readonly leases_count: number;
    readonly never_reminded_count: number;
    readonly by_age: {
      readonly under_8: CompteEtMontant;
      readonly from_8_to_30: CompteEtMontant;
      readonly over_30: CompteEtMontant;
    };
  };
  readonly deposits_held: number;
  readonly payouts_awaiting_approval: CompteEtMontant & { readonly landlords_count: number };
  readonly payouts_pending: CompteEtMontant;
  /** TCK-2720 — l'union des deux files (`pending` + `awaiting_approval`), avec les bailleurs DISTINCTS qui attendent. */
  readonly payouts_open: CompteEtMontant & { readonly landlords_count: number };
  readonly invoices_draft: CompteEtMontant;
}

export function useFinanceSummary(agencyId: number | undefined, period: string) {
  return useApiQuery<ApiResponse<FinanceSummary>>(
    agencyReportingKeys.financeSummary(agencyId, period),
    cheminApi`/api/agencies/${agencyId}/finance/summary`,
    { params: { extra: { period } }, enabled: typeof agencyId === 'number', staleTime: 30_000 },
  );
}

/** `GET /api/agencies/{agency}/team-performance?period=Y-m` — l'onglet « Performance » de l'équipe. */
export function useTeamPerformance(agencyId: number, period: string) {
  return useApiQuery<ApiResponse<TeamPerformance>>(
    agencyReportingKeys.teamPerformance(agencyId, period),
    cheminApi`/api/agencies/${agencyId}/team-performance`,
    { params: { extra: { period } } },
  );
}
