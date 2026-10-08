'use client';

/**
 * TCK-595 (ADR-0049 §3) — le grand livre des commissions (`GET /api/commissions`).
 *
 * L'API décide de la portée : l'agent ne reçoit que ses lignes, qui détient `reports.view_agency`
 * reçoit toutes celles de l'agence. Le front ne filtre rien de lui-même : il n'affiche que ce qu'on
 * lui sert, avec les totaux par statut de `meta.totals` (calculés sur toute la portée, pas sur la
 * page).
 *
 * ⚠️ Les chemins portent `/api` : `useApiQuery` et `useApiMutation` ne l'ajoutent PAS.
 */

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginationMeta } from '@/types/api';
import { cheminApi } from '@/lib/chemin-api';

export type CommissionEntryStatus = 'due' | 'paid' | 'cancelled';

export interface CommissionEntry {
  readonly id: number;
  readonly agency_id: number;
  readonly lease_id: number;
  readonly beneficiary_id: number;
  readonly origin: 'negotiator' | 'collaborator';
  readonly base_amount: number;
  readonly share_percent: number;
  readonly amount: number;
  readonly currency: string | null;
  readonly status: CommissionEntryStatus;
  readonly earned_at: string | null;
  readonly paid_at: string | null;
  readonly cancelled_at: string | null;
  readonly beneficiary?: { readonly id: number; readonly name: string } | null;
  readonly lease?: { readonly id: number; readonly reference_number: string | null; readonly type: string | null } | null;
}

export interface CommissionLedgerResponse {
  readonly data: CommissionEntry[];
  readonly meta: PaginationMeta & { readonly totals: Record<CommissionEntryStatus, number> };
}

export interface UseCommissionEntriesParams {
  readonly status?: CommissionEntryStatus;
  readonly page?: number;
}

const FIELDS = [
  'id', 'agency_id', 'lease_id', 'beneficiary_id', 'origin', 'base_amount', 'share_percent',
  'amount', 'currency', 'status', 'earned_at', 'paid_at', 'cancelled_at',
];

export const commissionKeys = {
  all: ['commissions'] as const,
  list: (params: UseCommissionEntriesParams) => ['commissions', 'list', params] as const,
};

export function useCommissionEntries(params: UseCommissionEntriesParams) {
  return useApiQuery<CommissionLedgerResponse>(commissionKeys.list(params), '/api/commissions', {
    params: {
      fields: { commission_entries: FIELDS },
      filter: params.status ? { status: params.status } : undefined,
      include: ['lease', 'beneficiary'],
      sort: '-earned_at',
      page: params.page ?? 1,
      per_page: 20,
    },
  });
}

/** Geste d'argent : famille protégée et step-up côté API, que `useApiMutation` résout sur place. */
export function useMarkCommissionPaid() {
  return useApiMutation<ApiResponse<CommissionEntry>, { id: number }>(
    { path: ({ id }) => cheminApi`/api/commissions/${id}/mark-paid`, method: 'POST', body: () => ({}) },
    { invalidate: [commissionKeys.all] },
  );
}

export function useCancelCommission() {
  return useApiMutation<ApiResponse<CommissionEntry>, { id: number }>(
    { path: ({ id }) => cheminApi`/api/commissions/${id}/cancel`, method: 'POST', body: () => ({}) },
    { invalidate: [commissionKeys.all] },
  );
}
