'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { TenantOnboardingChecklist, TenantOnboardingChecklistItem } from '@/types/tenant-onboarding';

/**
 * TCK-266 — React Query hooks for the TenantOnboardingChecklist resource.
 *
 *  - GET    /api/me/leases/{lease}/onboarding-checklist
 *  - POST   /api/me/leases/{lease}/onboarding-checklist/{item}/complete
 *  - GET    /api/agencies/{agency}/tenant-onboarding-pending
 */

const CHECKLIST_FIELDS: string[] = [
  'id',
  'lease_id',
  'user_id',
  'welcome_seen_at',
  'inventory_completed_at',
  'first_payment_at',
  'documents_acknowledged_at',
  'completed_at',
  'created_at',
  'updated_at',
];

export function useTenantOnboardingChecklist(leaseId: number | null | undefined) {
  return useApiQuery<ApiResponse<TenantOnboardingChecklist | null>>(
    ['tenant-onboarding', 'checklist', leaseId],
    `/api/me/leases/${leaseId ?? ''}/onboarding-checklist`,
    {
      enabled: Boolean(leaseId),
    },
  );
}

export function useCompleteOnboardingItem(leaseId: number) {
  return useApiMutation<
    ApiResponse<TenantOnboardingChecklist>,
    { item: TenantOnboardingChecklistItem }
  >(
    {
      path: ({ item }) => `/api/me/leases/${leaseId}/onboarding-checklist/${item}/complete`,
      method: 'POST',
      // The route encodes the item segment ; the body is empty.
      body: () => ({}),
    },
    {
      invalidate: () => [
        ['tenant-onboarding', 'checklist', leaseId],
        ['leases', 'detail', leaseId],
        ['leases', 'list'],
      ],
    },
  );
}

export type AgencyOnboardingPendingParams = {
  agencyId: number | null | undefined;
  page?: number;
  per_page?: number;
};

export function useAgencyOnboardingPending(params: AgencyOnboardingPendingParams) {
  const { agencyId, page = 1, per_page = 20 } = params;
  const spatieParams: SpatieQueryParams = {
    fields: {
      tenant_onboarding_checklists: CHECKLIST_FIELDS,
      // Sparse fieldsets on the included relations — same convention as
      // the rest of the codebase to avoid blowing up payload size.
      leases: ['id', 'reference_number', 'tenant_id', 'property_id', 'agency_id', 'signed_at'],
    },
    include: ['lease'],
    sort: ['created_at'],
    page,
    per_page,
  };

  return useApiQuery<PaginatedResponse<TenantOnboardingChecklist & { lease?: unknown }>>(
    ['tenant-onboarding', 'agency-pending', agencyId, page, per_page],
    `/api/agencies/${agencyId ?? ''}/tenant-onboarding-pending`,
    {
      params: spatieParams,
      enabled: Boolean(agencyId),
    },
  );
}
