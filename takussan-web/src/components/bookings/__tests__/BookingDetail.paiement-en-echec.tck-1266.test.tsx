/**
 * TCK-1266 (P146.01) — un paiement de réservation en échec se lit « Échec », sur le ton du danger.
 *
 * L'échec d'un paiement en ligne écrit `failed` sur un `BookingPayment` (`PaymentGatewayService`).
 * Le badge ne connaissait ni `failed` ni `late` : il rendait la valeur brute, sur le ton neutre.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { BookingDetail } from '../BookingDetail';
import { useBooking, type CreateBookingPaymentPayload } from '@/lib/queries/bookings';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/hooks/useCan', () => ({ useCanAll: () => ({ can: false, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 999, roles: ['customer'] }, token: 'jeton-client' }),
}));
vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: [] }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function avecPaiement(status: string) {
  vi.mocked(useBooking).mockReturnValue({
    data: {
      data: {
        id: 1,
        agency_id: 5,
        status: 'confirmed',
        reference_number: 'BK-1',
        property: { id: 2, title: 'Villa', slug: 'villa' },
        customer: { user_id: 999 },
        booking_payments: [
          {
            id: 44,
            amount: 50000,
            currency: 'XOF',
            status,
            payment_type: 'deposit',
            payment_method: 'wave',
            payment_date: '2026-09-01T10:00:00+00:00',
            created_at: '2026-09-01T10:00:00+00:00',
            transaction_id: null,
          },
        ],
        notes: null,
      },
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useBooking>);
}

function rendre() {
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={1} />
      </ToastProvider>,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BookingDetail — statut d’un paiement de réservation (TCK-1266, P146.01)', () => {
  it.each([
    ['failed', 'Échec'],
    ['late', 'En retard'],
  ])('« %s » se lit traduit, sur le ton du danger', (status, libelle) => {
    avecPaiement(status);
    rendre();

    const badge = screen.getByText(libelle);
    expect(badge.closest('[data-tone]')?.getAttribute('data-tone')).toBe('danger');
    expect(screen.queryByText(status)).toBeNull();
  });

  it('le dictionnaire reprend les libellés existants de `payments.status`', () => {
    expect(fr.bookings.paymentStatus).toMatchObject({
      failed: fr.payments.status.failed,
      late: fr.payments.status.late,
    });
  });

  it('le type de charge n’offre pas `cancelled`, que l’API refuse', () => {
    // @ts-expect-error — `StoreBookingPaymentRequest` exclut `cancelled` (garde de `tsc`).
    const charge: CreateBookingPaymentPayload = { amount: 1, payment_type: 'deposit', status: 'cancelled' };
    expect(charge.status).toBe('cancelled');
  });
});
