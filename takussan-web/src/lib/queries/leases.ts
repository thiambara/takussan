'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';
import type { Guarantor, Lease, LeasePayment } from '@/types/lease';
import type { PropertyListItem } from '@/types/property';

/**
 * React Query hooks for the Lease resource.
 */

const LIST_FIELDS: string[] = [
  'id',
  'reference_number',
  'type',
  'status',
  'start_date',
  'end_date',
  'monthly_rent',
  'sale_price',
  'currency',
  'deposit_amount',
  'property_id',
  'tenant_id',
  'landlord_id',
  'created_at',
];

const DETAIL_FIELDS: string[] = [
  ...LIST_FIELDS,
  'agency_id',
  'booking_id',
  'guarantor_id',
  'payment_frequency',
  'payment_day',
  'terms',
  'special_conditions',
  'signed_at',
  'terminated_at',
  'termination_reason',
  // TCK-088 — deposit refund block (banner + modal pre-fill).
  'deposit_refunded_amount',
  'deposit_refunded_at',
  'deposit_refund_reason',
  // TCK-090 — early-termination workflow snapshot. Required by the
  // `EarlyTerminationBanner` rendered on the lease detail page; without
  // these fields in the sparse fieldset, `early_termination_effective_date`
  // would be undefined and the banner would silently never render.
  'early_termination_requested_at',
  'early_termination_requested_by',
  'early_termination_effective_date',
  'early_termination_penalty_amount',
  'early_termination_reason',
  'early_termination_invoice_id',
  'notice_period_days',
];

export type UseLeasesParams = {
  status?: string;
  property_id?: number;
  tenant_id?: number;
  page?: number;
  per_page?: number;
  search?: string;
};

export function useLeases(params: UseLeasesParams = {}) {
  const filter: Record<string, string | number> = {};
  if (params.status) filter.status = params.status;
  if (params.property_id) filter.property_id = params.property_id;
  if (params.tenant_id) filter.tenant_id = params.tenant_id;
  if (params.search) filter.search = params.search;

  const spatieParams: SpatieQueryParams = {
    fields: {
      leases: LIST_FIELDS,
      // `main_photo_url` is computed (Spatie media library), not a DB column —
      // omit from sparse fieldset; PropertyResource emits it anyway.
      properties: ['id', 'title', 'slug'],
    },
    filter,
    include: ['property'],
    sort: ['-created_at'],
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<Lease>>(
    ['leases', 'list', params],
    '/api/leases',
    { params: spatieParams },
  );
}

export function useLeasePropertyOptions() {
  const spatieParams: SpatieQueryParams = {
    fields: {
      properties: [
        'id',
        'reference_number',
        'title',
        'slug',
        'price',
        'currency',
        'type',
        'contract_type',
        'status',
        'visibility',
        'created_at',
      ],
    },
    filter: { status: 'available' },
    sort: ['title'],
    per_page: 100,
  };

  return useApiQuery<PaginatedResponse<PropertyListItem>>(
    ['leases', 'property-options'],
    '/api/properties',
    { params: spatieParams },
  );
}

export function useLeaseCustomerOptions(search?: string) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      customers: [
        'id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'status',
        'pipeline_stage',
        'created_at',
      ],
    },
    filter: search ? { search } : {},
    sort: ['last_name', 'first_name'],
    per_page: 50,
  };

  return useApiQuery<PaginatedResponse<CustomerListItem>>(
    ['leases', 'customer-options', search ?? ''],
    '/api/customers',
    { params: spatieParams },
  );
}

export type LeasePropertyLite = {
  id: number;
  title: string;
  slug: string;
  main_photo_url: string | null;
};

export type LeaseWithRelations = Lease & {
  guarantor?: Guarantor;
  payments?: LeasePayment[];
  property?: LeasePropertyLite;
};

export function useLease(id: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      leases: DETAIL_FIELDS,
      // `main_photo_url` is computed (Spatie media library), not a DB column —
      // omit from sparse fieldset; PropertyResource emits it anyway.
      properties: ['id', 'title', 'slug'],
    },
    include: ['property', 'guarantor', 'payments'],
  };

  return useApiQuery<ApiResponse<LeaseWithRelations>>(
    ['leases', 'detail', id],
    `/api/leases/${id ?? ''}`,
    {
      params: spatieParams,
      enabled: Boolean(id),
    },
  );
}

export function useLeasePayments(leaseId: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      lease_payments: [
        'id',
        'lease_id',
        'amount',
        'currency',
        'payment_method',
        'payment_type',
        'period_start',
        'period_end',
        'due_date',
        'paid_at',
        'status',
        'late_fee',
        'reference_number',
        'notes',
      ],
    },
    filter: { lease_id: leaseId ?? 0 },
    sort: ['due_date'],
    per_page: 100,
  };

  return useApiQuery<PaginatedResponse<LeasePayment>>(
    ['leases', 'payments', leaseId],
    `/api/leases/${leaseId ?? ''}/payments`,
    {
      params: spatieParams,
      enabled: Boolean(leaseId),
    },
  );
}

export type CreateLeasePayload = {
  property_id: number;
  tenant_id: number;
  landlord_id: number;
  agency_id?: number;
  type: 'residential_rent' | 'commercial_rent' | 'seasonal_rent' | 'sale';
  start_date: string;
  end_date?: string;
  monthly_rent?: number;
  sale_price?: number;
  deposit_amount: number;
  currency?: string;
  payment_frequency?: 'monthly' | 'quarterly' | 'yearly';
  payment_day?: number;
  terms?: string;
  special_conditions?: string;
};

export function useCreateLease() {
  return useApiMutation<ApiResponse<Lease>, CreateLeasePayload>(
    { path: '/api/leases', method: 'POST' },
    { invalidate: [['leases', 'list']] },
  );
}

export function useUpdateLease(id: number) {
  return useApiMutation<ApiResponse<Lease>, Partial<CreateLeasePayload>>(
    { path: `/api/leases/${id}`, method: 'PUT' },
    {
      invalidate: [
        ['leases', 'list'],
        ['leases', 'detail', id],
      ],
    },
  );
}

export function useActivateLease(id: number) {
  return useApiMutation<ApiResponse<Lease>, void>(
    { path: `/api/leases/${id}/activate`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'list'],
        ['leases', 'detail', id],
        ['leases', 'payments', id],
      ],
    },
  );
}

export type ReviewRentPayload = {
  new_rent: number;
  reason: string;
  effective_date?: string;
  force?: boolean;
};

export function useReviewLeaseRent(id: number) {
  return useApiMutation<ApiResponse<Lease>, ReviewRentPayload>(
    { path: `/api/leases/${id}/rent`, method: 'PATCH' },
    {
      invalidate: [
        ['leases', 'list'],
        ['leases', 'detail', id],
      ],
    },
  );
}

export type CreateLeasePaymentPayload = {
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'mobile_money' | 'check' | 'card';
  payment_type?: 'rent' | 'charges' | 'deposit' | 'deposit_refund' | 'regularization' | 'penalty';
  period_start: string;
  period_end: string;
  paid_at?: string;
  reference_number?: string;
  notes?: string;
};

export function useCreateLeasePayment(leaseId: number) {
  return useApiMutation<ApiResponse<LeasePayment>, CreateLeasePaymentPayload>(
    { path: `/api/leases/${leaseId}/payments`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'payments', leaseId],
        ['leases', 'list'],
      ],
    },
  );
}

export type GenerateSchedulePayload = {
  start_date?: string;
  end_date?: string;
};

export function useGenerateSchedule(leaseId: number) {
  return useApiMutation<ApiResponse<{ generated: number }>, GenerateSchedulePayload>(
    { path: `/api/leases/${leaseId}/generate-schedule`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'payments', leaseId],
      ],
    },
  );
}

export type CreateGuarantorPayload = {
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  id_type?: 'id_card' | 'passport' | 'driving_license';
  id_number?: string;
  occupation?: string;
  employer?: string;
  monthly_income?: number;
  relationship_to_tenant?: string;
  notes?: string;
};

export function useCreateGuarantor(leaseId: number) {
  return useApiMutation<ApiResponse<Guarantor>, CreateGuarantorPayload>(
    { path: `/api/leases/${leaseId}/guarantors`, method: 'POST' },
    { invalidate: [['leases', 'detail', leaseId]] },
  );
}

// TCK-088 — Deposit refund: state read + refund mutation.
export type DepositRefundState = {
  deposit_amount: number;
  deposit_refunded_amount: number;
  deposit_remaining: number;
  deposit_refunded_at: string | null;
  deposit_refund_reason: string | null;
  state: 'none' | 'partial' | 'full';
  attachments: Array<{ id: number; name: string; url: string }>;
};

export function useDepositRefundState(leaseId: number | null | undefined) {
  return useApiQuery<ApiResponse<DepositRefundState>>(
    ['leases', 'deposit-refund', leaseId],
    `/api/leases/${leaseId ?? ''}/deposit-refund`,
    { enabled: Boolean(leaseId) },
  );
}

export type RefundDepositPayload = {
  amount: number;
  reason?: string;
  attachments?: number[];
};

export function useRefundDeposit(leaseId: number) {
  return useApiMutation<ApiResponse<unknown>, RefundDepositPayload>(
    { path: `/api/leases/${leaseId}/deposit-refund`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'deposit-refund', leaseId],
        ['leases', 'payments', leaseId],
      ],
    },
  );
}

// TCK-089 — Renouvellement / avenant + chaîne historique.
export type RenewLeasePayload = {
  start_date: string;
  end_date?: string;
  monthly_rent?: number;
  deposit_amount?: number;
  late_fee_percent?: number;
  late_fee_grace_days?: number;
  terms?: string;
  special_conditions?: string;
};

export function useRenewLease(leaseId: number) {
  return useApiMutation<ApiResponse<Lease>, RenewLeasePayload>(
    { path: `/api/leases/${leaseId}/renew`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'list'],
        ['leases', 'chain', leaseId],
      ],
    },
  );
}

const CHAIN_FIELDS: string[] = [
  'id',
  'reference_number',
  'status',
  'start_date',
  'end_date',
  'monthly_rent',
  'deposit_amount',
  'late_fee_percent',
  'late_fee_grace_days',
  'terms',
  'renewed_from_lease_id',
  'currency',
];

export function useLeaseChain(leaseId: number | null | undefined) {
  return useApiQuery<{ data: Lease[] }>(
    ['leases', 'chain', leaseId],
    `/api/leases/${leaseId ?? ''}/chain`,
    {
      params: { fields: { leases: CHAIN_FIELDS } },
      enabled: Boolean(leaseId),
    },
  );
}

// TCK-090 — Résiliation anticipée + pénalités.
export type RequestEarlyTerminationPayload = {
  effective_date: string;
  reason?: string;
  requested_by_role?: string;
};

export function useRequestEarlyTermination(leaseId: number) {
  return useApiMutation<ApiResponse<Lease>, RequestEarlyTerminationPayload>(
    { path: `/api/leases/${leaseId}/early-termination`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'list'],
      ],
    },
  );
}

export function useCancelEarlyTermination(leaseId: number) {
  return useApiMutation<ApiResponse<Lease>, void>(
    { path: `/api/leases/${leaseId}/early-termination`, method: 'DELETE' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'list'],
      ],
    },
  );
}

export function useConfirmEarlyTermination(leaseId: number) {
  return useApiMutation<ApiResponse<Lease>, void>(
    { path: `/api/leases/${leaseId}/early-termination/confirm`, method: 'POST' },
    {
      invalidate: [
        ['leases', 'detail', leaseId],
        ['leases', 'list'],
      ],
    },
  );
}
