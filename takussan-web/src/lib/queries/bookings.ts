'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking, BookingPayment } from '@/types/booking';
import type { SpatieQueryParams } from '@/types/api';

/**
 * React Query hooks for the Booking resource.
 *
 * Always use sparse fieldsets + `include` to avoid over-fetching
 * (see CLAUDE.md → "API — Conventions frontend").
 */

const LIST_FIELDS: string[] = [
  'id',
  'reference_number',
  'status',
  'start_date',
  'end_date',
  'total_amount',
  'deposit_amount',
  'created_at',
  'property_id',
  'customer_id',
  'agency_id',
];

const DETAIL_FIELDS: string[] = [
  ...LIST_FIELDS,
  'confirmed_at',
  'cancelled_at',
  'expires_at',
  'expired_at',
  'cancellation_reason',
  'notes',
];

export type UseBookingsParams = {
  status?: string;
  page?: number;
  per_page?: number;
  search?: string;
};

export function useBookings(params: UseBookingsParams = {}) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      bookings: LIST_FIELDS,
      // `main_photo_url` is computed (Spatie media library), not a DB column —
      // omit from sparse fieldset; PropertyResource emits it anyway.
      properties: ['id', 'title', 'slug', 'price', 'currency'],
    },
    filter: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search ? { search: params.search } : {}),
    },
    include: ['property'],
    sort: ['-created_at'],
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<Booking>>(
    ['bookings', 'list', params],
    '/api/bookings',
    { params: spatieParams },
  );
}

export function useBooking(id: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      bookings: DETAIL_FIELDS,
      properties: ['id', 'title', 'slug', 'price', 'currency', 'contract_type'],
      customers: ['id', 'user_id'],
    },
    include: ['property', 'booking_payments', 'customer'],
  };

  return useApiQuery<ApiResponse<Booking>>(
    ['bookings', 'detail', id],
    `/api/bookings/${id ?? ''}`,
    {
      params: spatieParams,
      enabled: Boolean(id),
    },
  );
}

export type CreateBookingPayload = {
  property_id: number;
  start_date: string;
  end_date: string;
  guests?: number;
  notes?: string;
};

export function useCreateBooking() {
  return useApiMutation<ApiResponse<Booking>, CreateBookingPayload>(
    { path: '/api/bookings', method: 'POST' },
    { invalidate: [['bookings', 'list']] },
  );
}

export type CreateBookingPaymentPayload = {
  amount: number;
  payment_method?: 'cash' | 'bank_transfer' | 'mobile_money' | 'card';
  payment_type: 'deposit' | 'advance' | 'fee';
  /** TCK-172 — set to `pending` for the customer self-service gateway flow. */
  status?: 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'cancelled';
  transaction_id?: string;
  notes?: string;
};

export function useCancelBooking(bookingId: number) {
  return useApiMutation<ApiResponse<Booking>, { reason?: string }>(
    { path: `/api/bookings/${bookingId}/cancel`, method: 'POST' },
    {
      invalidate: [
        ['bookings', 'detail', bookingId],
        ['bookings', 'list'],
      ],
    },
  );
}

export function useConfirmBooking(bookingId: number) {
  return useApiMutation<ApiResponse<Booking>, void>(
    { path: `/api/bookings/${bookingId}/confirm`, method: 'POST' },
    {
      invalidate: [
        ['bookings', 'detail', bookingId],
        ['bookings', 'list'],
      ],
    },
  );
}

export function useRejectBooking(bookingId: number) {
  return useApiMutation<ApiResponse<Booking>, { reason?: string }>(
    { path: `/api/bookings/${bookingId}/reject`, method: 'POST' },
    {
      invalidate: [
        ['bookings', 'detail', bookingId],
        ['bookings', 'list'],
      ],
    },
  );
}

export function useCreateBookingPayment(bookingId: number) {
  return useApiMutation<ApiResponse<BookingPayment>, CreateBookingPaymentPayload>(
    { path: `/api/bookings/${bookingId}/payments`, method: 'POST' },
    {
      invalidate: [
        ['bookings', 'detail', bookingId],
        ['bookings', 'list'],
      ],
    },
  );
}

export type RefundBookingPaymentPayload = {
  paymentId: number;
  refund_amount: number;
  refund_reason?: string;
};

/**
 * TCK-596 — rembourse un paiement de réservation (`POST /api/booking-payments/{id}/refund`), la
 * route qui n'avait aucun appelant. Réservé au personnel titulaire de `bookings.refund`, au
 * bailleur direct et au super-admin : le détail l'annonce par `can_refund`.
 */
export function useRefundBookingPayment(bookingId: number) {
  return useApiMutation<ApiResponse<BookingPayment>, RefundBookingPaymentPayload>(
    {
      path: ({ paymentId }) => `/api/booking-payments/${paymentId}/refund`,
      method: 'POST',
      body: ({ refund_amount, refund_reason }) => ({ refund_amount, refund_reason }),
    },
    {
      invalidate: [
        ['bookings', 'detail', bookingId],
        ['bookings', 'list'],
      ],
    },
  );
}
