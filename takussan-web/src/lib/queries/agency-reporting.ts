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
};

/** `GET /api/agencies/{agency}/finance/aging` — l'onglet « Impayés » de `/admin/finances`. */
export function useAgingBalance(agencyId: number | undefined, groupBy: AgingGroupBy) {
  return useApiQuery<ApiResponse<AgingBalance>>(
    agencyReportingKeys.aging(agencyId, groupBy),
    cheminApi`/api/agencies/${agencyId}/finance/aging`,
    { params: { extra: { group_by: groupBy } }, enabled: typeof agencyId === 'number' },
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
