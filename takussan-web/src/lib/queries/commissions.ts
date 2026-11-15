'use client';

/**
 * TCK-595 (ADR-0049 §3) — le grand livre des commissions (`GET /api/commissions`) ; TCK-2662 — le
 * point par bénéficiaire (`/summary`), le solde groupé (`/settle`), et les gestes qui portent
 * désormais leur preuve (`mark-paid` : date, moyen, référence) ou leur motif (`cancel`).
 *
 * L'API décide de la portée : l'agent ne reçoit que ses lignes, qui détient `reports.view_agency` ou
 * `payouts.approve` reçoit toutes celles de l'agence (`CommissionEntry::readsWholeLedger`). Le front
 * ne filtre rien de lui-même : il n'affiche que ce qu'on lui sert.
 *
 * `meta.totals` porte des MONTANTS par statut, calculés sur toute la portée et sans les filtres ; un
 * compte de lignes se lit par `meta.total` d'une lecture d'une ligne ({@link useCompteDesCommissions}).
 *
 * ⚠️ Les chemins portent `/api` : `useApiQuery` et `useApiMutation` ne l'ajoutent PAS.
 */

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginationMeta } from '@/types/api';
import { cheminApi } from '@/lib/chemin-api';

export type CommissionEntryStatus = 'due' | 'paid' | 'cancelled';

/** Les moyens qu'accepte un paiement de commission (`CommissionLedgerService::PAYMENT_METHODS`). */
export type MoyenDeCommission = 'wave' | 'orange_money' | 'free_money' | 'cash' | 'bank_transfer';

/** Les motifs d'annulation (`CommissionCancelReason`) ; `other` exige un texte. */
export type MotifDAnnulation = 'lease_terminated_before_move_in' | 'wrong_beneficiary' | 'wrong_rate_or_base' | 'other';

export const MOTIFS_D_ANNULATION: readonly MotifDAnnulation[] = [
  'lease_terminated_before_move_in',
  'wrong_beneficiary',
  'wrong_rate_or_base',
  'other',
];

export interface CommissionEntry {
  readonly id: number;
  readonly agency_id: number | null;
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
  readonly payment_method?: string | null;
  readonly payment_reference?: string | null;
  readonly cancel_reason_code?: MotifDAnnulation | null;
  readonly cancel_reason?: string | null;
  readonly beneficiary?: { readonly id: number; readonly name: string } | null;
  readonly lease?: {
    readonly id: number;
    readonly reference_number: string | null;
    readonly type: string | null;
    readonly property?: { readonly id: number; readonly title: string | null; readonly quarter: string | null } | null;
  } | null;
}

export interface CommissionLedgerResponse {
  readonly data: CommissionEntry[];
  readonly meta: PaginationMeta & { readonly totals: Record<CommissionEntryStatus, number> };
}

export interface UseCommissionEntriesParams {
  readonly status?: CommissionEntryStatus;
  readonly beneficiaryId?: number;
  /** Jours de Dakar `YYYY-MM-DD`, bornes incluses (`filter[earned_from]`, `filter[earned_to]`). */
  readonly earnedFrom?: string;
  readonly earnedTo?: string;
  /** Jours de Dakar `YYYY-MM-DD`, bornes incluses (`filter[paid_from]`, `filter[paid_to]`). */
  readonly paidFrom?: string;
  readonly paidTo?: string;
  readonly page?: number;
  readonly perPage?: number;
  /** `earned_at` croissant : les plus anciennes d'abord (le solde). Défaut : les plus récentes. */
  readonly sort?: 'earned_at' | '-earned_at' | '-paid_at';
  readonly enabled?: boolean;
}

export const COMMISSION_FIELDS = [
  'id', 'agency_id', 'lease_id', 'beneficiary_id', 'origin', 'base_amount', 'share_percent',
  'amount', 'currency', 'status', 'earned_at', 'paid_at', 'cancelled_at',
  'payment_method', 'payment_reference', 'cancel_reason_code', 'cancel_reason',
];

export interface PointDUnBeneficiaire {
  readonly beneficiary: { readonly id: number; readonly name: string };
  readonly due_amount: number;
  readonly due_count: number;
  readonly oldest_due_earned_at: string | null;
  readonly paid_month: number;
  readonly paid_year: number;
  readonly last_paid: { readonly at: string; readonly method: string | null } | null;
}

export interface CommissionSummaryResponse {
  readonly data: PointDUnBeneficiaire[];
  readonly meta: { readonly month: string; readonly year: string };
}

export const commissionKeys = {
  all: ['commissions'] as const,
  list: (params: Omit<UseCommissionEntriesParams, 'enabled'>) => ['commissions', 'list', params] as const,
  compte: (params: Omit<UseCommissionEntriesParams, 'enabled' | 'page' | 'perPage' | 'sort'>) => ['commissions', 'compte', params] as const,
  summary: (month: string, year: string) => ['commissions', 'summary', month, year] as const,
};

function filtres(params: UseCommissionEntriesParams): Record<string, string | number> | undefined {
  const f: Record<string, string | number> = {};
  if (params.status) f.status = params.status;
  if (params.beneficiaryId) f.beneficiary_id = params.beneficiaryId;
  if (params.earnedFrom) f.earned_from = params.earnedFrom;
  if (params.earnedTo) f.earned_to = params.earnedTo;
  if (params.paidFrom) f.paid_from = params.paidFrom;
  if (params.paidTo) f.paid_to = params.paidTo;
  return Object.keys(f).length ? f : undefined;
}

export function useCommissionEntries({ enabled = true, ...params }: UseCommissionEntriesParams) {
  return useApiQuery<CommissionLedgerResponse>(commissionKeys.list(params), '/api/commissions', {
    enabled,
    params: {
      fields: { commission_entries: COMMISSION_FIELDS },
      filter: filtres(params),
      include: ['lease.property', 'beneficiary'],
      sort: params.sort ?? '-earned_at',
      page: params.page ?? 1,
      per_page: params.perPage ?? 20,
    },
  });
}

/** Le nombre de lignes d'une sélection : `meta.total` d'une lecture d'UNE ligne, sans relation. */
export function useCompteDesCommissions({ enabled = true, ...params }: Omit<UseCommissionEntriesParams, 'page' | 'perPage' | 'sort'>) {
  const query = useApiQuery<CommissionLedgerResponse>(commissionKeys.compte(params), '/api/commissions', {
    enabled,
    params: { fields: { commission_entries: ['id'] }, filter: filtres(params), per_page: 1 },
  });
  return query.data?.meta.total;
}

/** Le plus de lignes annulées qu'une lecture somme ({@link useAnnulees}) ; au-delà, le montant est un plancher. */
export const ANNULEES_MAX = 100;

/**
 * TCK-2662 (décision 7 b) — les lignes annulées d'une sélection : leur compte (`meta.total`) et leur
 * montant, sommé sur les lignes lues. `meta.totals` ne convient pas : il couvre toute la portée,
 * sans les filtres (le bénéficiaire, l'année) que portent les puces à côté desquelles il s'affiche.
 * Les annulations sont rares : une lecture de {@link ANNULEES_MAX} lignes, deux colonnes ; au-delà,
 * `tronque` dit que le montant est un plancher.
 */
export function useAnnulees({ enabled = true, ...params }: Omit<UseCommissionEntriesParams, 'status' | 'page' | 'perPage' | 'sort'>) {
  const query = useApiQuery<CommissionLedgerResponse>(commissionKeys.compte({ ...params, status: 'cancelled' }), '/api/commissions', {
    enabled,
    params: { fields: { commission_entries: ['id', 'amount', 'currency'] }, filter: filtres({ ...params, status: 'cancelled' }), per_page: ANNULEES_MAX },
  });
  const data = query.data;
  if (!data) return undefined;
  return {
    compte: data.meta.total,
    montant: data.data.reduce((somme, e) => somme + e.amount, 0),
    devise: data.data[0]?.currency || 'XOF',
    tronque: data.meta.total > data.data.length,
  } as const;
}

/** Le point par bénéficiaire : `month` `YYYY-MM`, `year` `YYYY` (heure de Dakar). */
export function useCommissionSummary(month: string, year: string, enabled = true) {
  return useApiQuery<CommissionSummaryResponse>(commissionKeys.summary(month, year), '/api/commissions/summary', {
    enabled,
    params: { extra: { month, year } },
  });
}

/** La preuve d'un paiement : le jour (Dakar, au plus aujourd'hui), le moyen, la référence (hors espèces). */
export interface PreuveDePaiement {
  readonly paid_at: string;
  readonly payment_method: MoyenDeCommission;
  readonly payment_reference: string | null;
}

export interface SoldeDUnBeneficiaire extends PreuveDePaiement {
  readonly beneficiary_id: number;
  readonly entry_ids: readonly number[];
}

/** Au plus autant de lignes par solde que l'API en accepte (`CommissionLedgerService::SETTLE_MAX`). */
export const SOLDE_MAX = 100;

/** Gestes d'argent : famille protégée et step-up côté API, que `useApiMutation` résout sur place. */
export function useMarkCommissionPaid() {
  return useApiMutation<ApiResponse<CommissionEntry>, { id: number } & PreuveDePaiement>(
    { path: ({ id }) => cheminApi`/api/commissions/${id}/mark-paid`, method: 'POST', body: ({ id: _id, ...preuve }) => preuve },
    { relireSurErreur: true, invalidate: [commissionKeys.all] },
  );
}

export function useSettleCommissions() {
  return useApiMutation<{ data: CommissionEntry[] }, SoldeDUnBeneficiaire>(
    { path: '/api/commissions/settle', method: 'POST', body: (solde) => solde },
    { relireSurErreur: true, invalidate: [commissionKeys.all] },
  );
}

export function useCancelCommission() {
  return useApiMutation<ApiResponse<CommissionEntry>, { id: number; reason_code: MotifDAnnulation; reason: string | null }>(
    { path: ({ id }) => cheminApi`/api/commissions/${id}/cancel`, method: 'POST', body: ({ id: _id, ...motif }) => motif },
    { relireSurErreur: true, invalidate: [commissionKeys.all] },
  );
}
