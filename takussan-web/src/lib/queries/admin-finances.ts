'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse } from '@/types/api';
import type { Invoice, InvoiceStatus, Payout, PayoutStatus } from '@/types/invoice';

/**
 * TCK-134 — small KPI aggregations for `/admin/finances`.
 *
 * The spec forbids summing pages of results in JS — KPIs must come from an
 * aggregate endpoint or from `meta.total` returned by the API. The agency
 * dashboard endpoint (`/api/dashboard/agency`) already covers the revenue
 * and overdue KPIs; the two below fill the remaining tiles by hitting the
 * existing list endpoints with `per_page=1` to surface only `meta.total`
 * (no client-side counting). The data array is dropped, only the count is
 * consumed.
 *
 * The active agency scope is imposed server-side (TCK-141 → ResolveActiveProfile
 * + the controller's role-gated builder), so these queries never send
 * `filter[agency_id]`.
 */

const COUNT_FIELDS = ['id'] as const;

export const adminFinancesQueryKeys = {
  pendingPayoutsCount: () => ['admin-finances', 'pending-payouts-count'] as const,
  draftInvoicesCount: () => ['admin-finances', 'draft-invoices-count'] as const,
};

export function usePendingPayoutsCount() {
  return useApiQuery<PaginatedResponse<Payout>>(
    adminFinancesQueryKeys.pendingPayoutsCount(),
    '/api/payouts',
    {
      params: {
        fields: { payouts: [...COUNT_FIELDS] },
        filter: { status: 'pending' satisfies PayoutStatus },
        per_page: 1,
      },
      staleTime: 30_000,
    },
  );
}

export function useDraftInvoicesCount() {
  return useApiQuery<PaginatedResponse<Invoice>>(
    adminFinancesQueryKeys.draftInvoicesCount(),
    '/api/invoices',
    {
      params: {
        fields: { invoices: [...COUNT_FIELDS] },
        filter: { status: 'draft' satisfies InvoiceStatus },
        per_page: 1,
      },
      staleTime: 30_000,
    },
  );
}
