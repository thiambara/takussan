'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking, BookingPayment } from '@/types/booking';
import type { SpatieQueryParams } from '@/types/api';
import { cheminApi } from '@/lib/chemin-api';

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

// P150.03 (TCK-1284) — pas de `search` : `GET /api/bookings` ne déclare aucun `filter[search]` (400).
export type UseBookingsParams = {
  status?: string;
  page?: number;
  per_page?: number;
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
  // P150.05 (TCK-1286) — `BookingController::show` charge `property.address`, `customer` et
  // `payments` quoi qu'on demande ; `booking_payments` sort de `BookingResource`, pas d'un `include`.
  const spatieParams: SpatieQueryParams = {
    include: ['property', 'customer'],
  };

  return useApiQuery<ApiResponse<Booking>>(
    ['bookings', 'detail', id],
    cheminApi`/api/bookings/${id ?? 0}`,
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
  /**
   * TCK-1309 (P133.05) — le personnel saisit montant et nature ; le client n'envoie ni l'un ni
   * l'autre : l'API les dérive (acompte, puis reste dû) et ignore ce qu'il enverrait.
   */
  amount?: number;
  payment_method?: 'cash' | 'bank_transfer' | 'mobile_money' | 'card';
  payment_type?: 'deposit' | 'advance' | 'fee';
  /**
   * TCK-172 — set to `pending` for the customer self-service gateway flow. TCK-1266 — sans
   * `cancelled`, que `StoreBookingPaymentRequest` refuse. TCK-1311 — ni `refunded` : une ligne
   * saisie naît `paid`, `pending` ou `partially_paid`.
   */
  status?: 'pending' | 'paid' | 'partially_paid';
  transaction_id?: string;
  notes?: string;
};

export function useCancelBooking(bookingId: number) {
  return useApiMutation<ApiResponse<Booking>, { reason?: string }>(
    { path: cheminApi`/api/bookings/${bookingId}/cancel`, method: 'POST' },
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
    { path: cheminApi`/api/bookings/${bookingId}/confirm`, method: 'POST' },
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
    { path: cheminApi`/api/bookings/${bookingId}/reject`, method: 'POST' },
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
    { path: cheminApi`/api/bookings/${bookingId}/payments`, method: 'POST' },
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
      path: ({ paymentId }) => cheminApi`/api/booking-payments/${paymentId}/refund`,
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
