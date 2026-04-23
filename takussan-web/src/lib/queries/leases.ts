'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { Guarantor, Lease, LeasePayment } from '@/types/lease';

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
      properties: ['id', 'title', 'slug', 'main_photo_url'],
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
      properties: ['id', 'title', 'slug', 'main_photo_url'],
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
