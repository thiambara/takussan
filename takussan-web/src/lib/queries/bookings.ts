'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking, BookingPayment } from '@/types/booking';
import type { SpatieQueryParams } from '@/types/api';
import { cheminApi } from '@/lib/chemin-api';
import type { CorpsDeLaDemande } from '@/lib/reservations/saisie-de-demande';
import type { ComptesDesReservations, NatureDeReservation } from '@/lib/reservations/liste-des-reservations';
import type { PAYMENT_METHOD_VALUES } from '@/components/payments/constants';

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
  'currency',
  'created_at',
  'property_id',
  // TCK-2594 — le téléphone du client et `visits_on_property` ne sortent que vers le personnel de
  // l'agence de la réservation (`BookingCustomerFacts`) : sans `agency_id` lu, ils sont masqués.
  'customer_id',
  'agency_id',
  // TCK-2579 / TCK-2594 — la nature et le prix affiché à la réservation (l'écart d'une offre).
  'kind',
  'list_price_at_booking',
];

/** TCK-2594 — le client d'une ligne : son nom et, pour le personnel, son téléphone. */
const LIST_CUSTOMER_FIELDS: string[] = ['id', 'first_name', 'last_name', 'phone'];

/**
 * Les filtres communs à la liste et à ses compteurs. TCK-2593 a ouvert `filter[search]` (référence,
 * nom et téléphone du client, titre du bien) — l'ancien « pas de `search` » de P150.03 ne vaut plus.
 */
export type FiltresDesReservations = {
  /** TCK-1735 (P167.05) — les réservations des biens de l'agent (« Mes chiffres »), `filter[managed_by]=me`. */
  onlyMine?: boolean;
  search?: string | null;
  propertyId?: number | null;
  customerId?: number | null;
};

function filtresCommuns(f: FiltresDesReservations): Record<string, string | number> {
  return {
    ...(f.onlyMine ? { managed_by: 'me' } : {}),
    ...(f.search ? { search: f.search } : {}),
    ...(f.propertyId ? { property_id: f.propertyId } : {}),
    ...(f.customerId ? { customer_id: f.customerId } : {}),
  };
}

export type UseBookingsParams = FiltresDesReservations & {
  /** TCK-2594 (ADR-0102) — `stay`, `application` ou `offer` : `filter[kind]`. */
  kind?: NatureDeReservation;
  /** Un statut, ou plusieurs séparés par des virgules (les groupes de « Mes réservations »). */
  status?: string;
  page?: number;
  per_page?: number;
  /** TCK-2594 — inclure le client (nom, téléphone) : la liste du personnel. */
  avecClient?: boolean;
  /** `false` : la lecture attend (la nature ou le statut ouvert dépend encore des compteurs). */
  enabled?: boolean;
};

export function useBookings(params: UseBookingsParams = {}) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      bookings: LIST_FIELDS,
      // `main_photo_url` is computed (Spatie media library), not a DB column —
      // omit from sparse fieldset; PropertyResource emits it anyway.
      properties: ['id', 'title', 'slug', 'price', 'currency', 'contract_type', 'rent_period'],
      ...(params.avecClient ? { customers: LIST_CUSTOMER_FIELDS } : {}),
    },
    filter: {
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...filtresCommuns(params),
    },
    include: params.avecClient ? ['property', 'customer'] : ['property'],
    sort: ['-created_at'],
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<Booking>>(
    ['bookings', 'list', params],
    '/api/bookings',
    { params: spatieParams, ...(params.enabled === false ? { enabled: false } : {}) },
  );
}

/**
 * TCK-2594 — les compteurs nature × statut (`GET /api/bookings/counts`, TCK-2593), en UNE lecture,
 * sous les mêmes filtres que la liste — nature et statut exceptés : chaque case égale le total de la
 * liste filtrée sur sa nature et son statut. Sous la clé `['bookings', 'list', …]` : toute mutation
 * qui invalide la liste invalide aussi ses compteurs.
 */
export function useBookingCounts(filtres: FiltresDesReservations = {}) {
  return useApiQuery<{ data: ComptesDesReservations }>(
    ['bookings', 'list', 'counts', filtres],
    '/api/bookings/counts',
    { params: { filter: filtresCommuns(filtres) } },
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
    // TCK-1406 (ADR-0072) — renvoyée après une réponse perdue, la réservation n'est créée qu'une fois.
    { idempotence: true, invalidate: [['bookings', 'list']] },
  );
}

/**
 * TCK-2580 (ADR-0102, TCK-2579) — le personnel saisit une candidature ou une offre au nom d'un
 * client. Même route que le tunnel, autre corps (`corpsDeLaDemande`) : `CreateBookingPayload` reste
 * celui du séjour, et le tunnel n'en voit rien.
 */
export function useRecordBookingForCustomer() {
  return useApiMutation<ApiResponse<Booking>, CorpsDeLaDemande>(
    { path: '/api/bookings', method: 'POST' },
    { idempotence: true, invalidate: [['bookings', 'list']] },
  );
}

export type CreateBookingPaymentPayload = {
  /**
   * TCK-1309 (P133.05) — le personnel saisit montant et nature ; le client n'envoie ni l'un ni
   * l'autre : l'API les dérive (acompte, puis reste dû) et ignore ce qu'il enverrait.
   */
  amount?: number;
  /** TCK-2594 — les huit moyens que `StoreBookingPaymentRequest` accepte (`PaymentMethod`). */
  payment_method?: (typeof PAYMENT_METHOD_VALUES)[number];
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
      relireSurErreur: true,
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
      relireSurErreur: true,
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
      relireSurErreur: true,
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
      // TCK-1400 (ADR-0072) — renvoyé après une réponse perdue, l'acompte n'est encaissé qu'une fois.
      idempotence: true,
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
