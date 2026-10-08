'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationMeta,
  SpatieQueryParams,
} from '@/types/api';
import type {
  Invoice,
  InvoiceStatus,
  OwnerStatement,
  PaymentHistoryRow,
  PaymentHistoryTotals,
  Payout,
  PayoutMethod,
  PayoutMethodKind,
  PayoutPreparation,
  PayoutStatus,
} from '@/types/invoice';

/**
 * Payments frontend hooks — TCK-063.
 *
 * Covers three slices:
 *   - unified payments history (`GET /api/payments/history`)
 *   - invoices CRUD + status transitions
 *   - payouts CRUD + status transitions
 *
 * All list queries honour spatie sparse fieldsets (CLAUDE.md → API
 * conventions). The payments-history endpoint doesn't go through the
 * spatie builder, but still accepts `filter[...]` params.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Payments history
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentHistoryEntity = 'property' | 'lease' | 'customer' | 'booking';

export type UsePaymentsHistoryParams = {
  readonly status?: string;
  readonly entity_type?: PaymentHistoryEntity;
  readonly entity_id?: number;
  readonly date_from?: string;
  readonly date_to?: string;
  readonly page?: number;
  readonly per_page?: number;
  readonly sort?: string;
};

export type PaymentHistoryMeta = PaginationMeta & {
  totals?: PaymentHistoryTotals;
  truncated?: boolean;
  limit?: number;
};

export type PaymentHistoryResponse = {
  data: PaymentHistoryRow[];
  meta: PaymentHistoryMeta;
};

export const paymentsQueryKeys = {
  history: (params: UsePaymentsHistoryParams) =>
    ['payments', 'history', params] as const,
  invoiceList: (params: UseInvoicesParams) =>
    ['invoices', 'list', params] as const,
  invoiceDetail: (id: number | null | undefined) =>
    ['invoices', 'detail', id] as const,
  payoutList: (params: UsePayoutsParams) =>
    ['payouts', 'list', params] as const,
  payoutDetail: (id: number | null | undefined) =>
    ['payouts', 'detail', id] as const,
  payoutPreparation: (params: UsePayoutPreparationParams) =>
    ['payouts', 'preparation', params] as const,
  myPayoutMethods: ['payout-methods', 'me'] as const,
  ownerStatement: (period: string) => ['owner-statements', period] as const,
};

export function usePaymentsHistory(params: UsePaymentsHistoryParams = {}) {
  const filter: Record<string, string | number> = {};
  if (params.status) filter.status = params.status;
  if (params.entity_type) filter.entity_type = params.entity_type;
  if (params.entity_id) filter.entity_id = params.entity_id;
  if (params.date_from) filter.date_from = params.date_from;
  if (params.date_to) filter.date_to = params.date_to;

  const query: SpatieQueryParams = {
    filter,
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
    sort: params.sort ?? '-date',
  };

  return useApiQuery<PaymentHistoryResponse>(
    paymentsQueryKeys.history(params),
    '/api/payments/history',
    { params: query },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices
// ─────────────────────────────────────────────────────────────────────────────

export const INVOICE_LIST_FIELDS = [
  'id',
  'reference_number',
  'customer_id',
  'issued_by_id',
  'agency_id',
  'status',
  'issue_date',
  'due_date',
  'subtotal',
  'tax_rate',
  'tax_amount',
  'total_amount',
  'currency',
  'created_at',
] as const;

export type UseInvoicesParams = {
  readonly status?: InvoiceStatus;
  readonly customer_id?: number;
  readonly search?: string;
  readonly page?: number;
  readonly per_page?: number;
};

export function useInvoices(params: UseInvoicesParams = {}) {
  const filter: Record<string, string | number> = {};
  if (params.status) filter.status = params.status;
  if (params.customer_id) filter.customer_id = params.customer_id;
  if (params.search) filter.search = params.search;

  const query: SpatieQueryParams = {
    fields: { invoices: INVOICE_LIST_FIELDS },
    filter,
    sort: '-created_at',
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<Invoice>>(
    paymentsQueryKeys.invoiceList(params),
    '/api/invoices',
    { params: query },
  );
}

export function useInvoice(id: number | null | undefined) {
  // TCK-594 — `show` charge les avoirs (`credit_notes`) : l'avoir se lit sur la facture d'origine.
  const query: SpatieQueryParams = {
    fields: {
      invoices: [...INVOICE_LIST_FIELDS, 'notes', 'invoiceable_type', 'invoiceable_id', 'kind', 'credited_invoice_id'],
    },
  };
  return useApiQuery<ApiResponse<Invoice>>(
    paymentsQueryKeys.invoiceDetail(id),
    `/api/invoices/${id ?? ''}`,
    { params: query, enabled: Boolean(id) },
  );
}

export type CreateInvoicePayload = {
  customer_id: number;
  invoiceable_type?: 'lease' | 'booking';
  invoiceable_id?: number;
  issue_date: string;
  due_date?: string;
  subtotal: number;
  tax_rate?: number;
  currency?: 'XOF' | 'XAF' | 'EUR' | 'USD';
  notes?: string;
};

export function useCreateInvoice() {
  return useApiMutation<ApiResponse<Invoice>, CreateInvoicePayload>(
    { path: '/api/invoices', method: 'POST' },
    { invalidate: [['invoices']] },
  );
}

export function useInvoiceSend(invoiceId: number) {
  return useApiMutation<ApiResponse<Invoice>, void>(
    { path: `/api/invoices/${invoiceId}/send`, method: 'POST', body: () => undefined },
    { invalidate: [['invoices']] },
  );
}

export function useInvoiceMarkPaid(invoiceId: number) {
  return useApiMutation<ApiResponse<Invoice>, void>(
    {
      path: `/api/invoices/${invoiceId}/mark-paid`,
      method: 'POST',
      body: () => undefined,
    },
    { invalidate: [['invoices']] },
  );
}

export function useInvoiceCancel(invoiceId: number) {
  return useApiMutation<ApiResponse<Invoice>, void>(
    {
      path: `/api/invoices/${invoiceId}/cancel`,
      method: 'POST',
      body: () => undefined,
    },
    { invalidate: [['invoices']] },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payouts
// ─────────────────────────────────────────────────────────────────────────────

export const PAYOUT_LIST_FIELDS = [
  'id',
  'reference_number',
  'lease_id',
  'booking_id',
  'agency_id',
  'landlord_id',
  'payee_role',
  'issued_by_id',
  'approved_by_id',
  'status',
  'period_start',
  'period_end',
  'gross_amount',
  'commission_amount',
  'fees_amount',
  'net_amount',
  'currency',
  'payment_method',
  'scheduled_at',
  'processed_at',
  'created_at',
] as const;

export type UsePayoutsParams = {
  readonly status?: PayoutStatus;
  readonly landlord_id?: number;
  readonly page?: number;
  readonly per_page?: number;
};

export function usePayouts(params: UsePayoutsParams = {}) {
  const filter: Record<string, string | number> = {};
  if (params.status) filter.status = params.status;
  if (params.landlord_id) filter.landlord_id = params.landlord_id;

  const query: SpatieQueryParams = {
    fields: { payouts: PAYOUT_LIST_FIELDS },
    filter,
    sort: '-created_at',
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<Payout>>(
    paymentsQueryKeys.payoutList(params),
    '/api/payouts',
    { params: query },
  );
}

export function usePayout(id: number | null | undefined) {
  const query: SpatieQueryParams = {
    fields: { payouts: [...PAYOUT_LIST_FIELDS, 'transaction_id', 'failed_reason', 'notes'] },
  };
  return useApiQuery<ApiResponse<Payout>>(
    paymentsQueryKeys.payoutDetail(id),
    `/api/payouts/${id ?? ''}`,
    { params: query, enabled: Boolean(id) },
  );
}

/**
 * TCK-594 (ADR-0039 §1) — un reversement se crée depuis les PIÈCES citées : le brut, la commission
 * et les frais se calculent côté serveur, aucun montant ne se saisit.
 */
export type CreatePayoutPayload = {
  landlord_id: number;
  lease_payment_ids?: number[];
  booking_payment_ids?: number[];
  service_provider_bill_ids?: number[];
  period_start?: string;
  period_end?: string;
  payout_method_id?: number;
  payment_method?: string;
  scheduled_at?: string;
  notes?: string;
};

export type UsePayoutPreparationParams = {
  readonly landlord_id?: number;
  readonly period_start?: string;
  readonly period_end?: string;
};

/** La lecture qui précède un reversement : lignes éligibles, commission, frais, net. */
export function usePayoutPreparation(params: UsePayoutPreparationParams) {
  const enabled = Boolean(params.landlord_id && params.period_start && params.period_end);
  return useApiQuery<ApiResponse<PayoutPreparation>>(
    paymentsQueryKeys.payoutPreparation(params),
    '/api/payouts/preparation',
    {
      params: {
        extra: {
          landlord_id: params.landlord_id,
          period_start: params.period_start,
          period_end: params.period_end,
        },
      },
      enabled,
    },
  );
}

/** Le second geste d'un reversement au-dessus du seuil de l'agence (ADR-0039 §4). */
export function usePayoutApprove(payoutId: number) {
  return useApiMutation<ApiResponse<Payout>, void>(
    { path: `/api/payouts/${payoutId}/approve`, method: 'POST', body: () => undefined },
    { invalidate: [['payouts']] },
  );
}

/** Les destinations d'un bénéficiaire, vues de l'agence : masquées, avec leur état de vérification. */
export function useVerifyPayoutMethod() {
  return useApiMutation<ApiResponse<PayoutMethod>, { id: number }>(
    { path: ({ id }) => `/api/payout-methods/${id}/verify`, method: 'POST', body: () => undefined },
    { invalidate: [['payout-methods'], ['payouts', 'preparation']] },
  );
}

export function useCreatePayout() {
  return useApiMutation<ApiResponse<Payout>, CreatePayoutPayload>(
    { path: '/api/payouts', method: 'POST' },
    { invalidate: [['payouts']] },
  );
}

export function usePayoutMarkProcessed(payoutId: number) {
  return useApiMutation<
    ApiResponse<Payout>,
    { transaction_id?: string; payment_method?: string; payout_method_id?: number; notes?: string }
  >(
    {
      path: `/api/payouts/${payoutId}/mark-processed`,
      method: 'POST',
    },
    { invalidate: [['payouts']] },
  );
}

export function usePayoutMarkFailed(payoutId: number) {
  return useApiMutation<ApiResponse<Payout>, { failed_reason: string }>(
    {
      path: `/api/payouts/${payoutId}/mark-failed`,
      method: 'POST',
    },
    { invalidate: [['payouts']] },
  );
}

export function usePayoutCancel(payoutId: number) {
  return useApiMutation<ApiResponse<Payout>, void>(
    {
      path: `/api/payouts/${payoutId}/cancel`,
      method: 'POST',
      body: () => undefined,
    },
    { invalidate: [['payouts']] },
  );
}

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance du lecteur (bailleur), pour un mois ou une année.
 * Sans `landlord_id`, l'API rend celui du lecteur ; l'autorisation est `OwnerStatementPolicy::view`.
 */
export function useOwnerStatement(period: string) {
  return useApiQuery<ApiResponse<OwnerStatement>>(
    paymentsQueryKeys.ownerStatement(period),
    '/api/owner-statements',
    { params: { extra: { period } }, enabled: /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(period) },
  );
}

/**
 * TCK-594 (ADR-0039 §6) — les destinations de paiement du titulaire connecté (bailleur,
 * prestataire). L'API ne rend jamais que le numéro MASQUÉ à l'agence ; l'écran ne montre que lui.
 */
export function useMyPayoutMethods(enabled = true) {
  return useApiQuery<ApiResponse<PayoutMethod[]>>(paymentsQueryKeys.myPayoutMethods, '/api/me/payout-methods', {
    enabled,
  });
}

export type PayoutMethodPayload = {
  kind: PayoutMethodKind;
  account_identifier: string;
  account_holder_name?: string | null;
  is_default?: boolean;
};

export function useCreateMyPayoutMethod() {
  return useApiMutation<ApiResponse<PayoutMethod>, PayoutMethodPayload>(
    { path: '/api/me/payout-methods', method: 'POST' },
    { invalidate: [['payout-methods']] },
  );
}

export function useSetDefaultPayoutMethod() {
  return useApiMutation<ApiResponse<PayoutMethod>, { id: number }>(
    { path: ({ id }) => `/api/me/payout-methods/${id}`, method: 'PATCH', body: () => ({ is_default: true }) },
    { invalidate: [['payout-methods']] },
  );
}

export function useDeleteMyPayoutMethod() {
  return useApiMutation<null, { id: number }>(
    { path: ({ id }) => `/api/me/payout-methods/${id}`, method: 'DELETE', body: () => undefined },
    { invalidate: [['payout-methods']] },
  );
}
