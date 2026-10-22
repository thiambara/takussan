/**
 * TCK-1180 (P100.02) — la fiche d'une réservation lit ce que l'API émet.
 *
 * Elle lisait `deposit_paid`, `deposit_date` et `expiration_date`, que `BookingResource` n'a jamais
 * émis (`BookingResourceContractTest`) : le badge « Payé » de l'acompte, le bloc « Expire le » et
 * l'événement « Acompte payé » de la chronologie ne s'affichaient jamais. L'acompte payé se dérive
 * des `booking_payments` que le `show` rend ; l'échéance se lit dans `expires_at`.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { BookingDetail } from '../BookingDetail';
import { useBooking } from '@/lib/queries/bookings';
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

const BASE = {
  id: 1,
  agency_id: 5,
  status: 'confirmed',
  reference_number: 'BK-1',
  total_amount: 200000,
  deposit_amount: 50000,
  currency: 'XOF',
  created_at: '2026-08-30T10:00:00+00:00',
  confirmed_at: '2026-08-31T10:00:00+00:00',
  expires_at: '2026-09-06T10:00:00+00:00',
  property: { id: 2, title: 'Villa', slug: 'villa' },
  customer: { user_id: 999 },
  notes: null,
};

const ACOMPTE = {
  id: 44,
  amount: 50000,
  currency: 'XOF',
  payment_type: 'deposit',
  payment_method: 'wave',
  paid_at: '2026-09-01T10:00:00+00:00',
  created_at: '2026-09-01T09:00:00+00:00',
  transaction_id: null,
};

function rendre(booking: Record<string, unknown>) {
  vi.mocked(useBooking).mockReturnValue({
    data: { data: booking },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useBooking>);
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={1} />
      </ToastProvider>,
    ),
  );
}

function blocAcompte() {
  return screen.getByText(fr.bookings.detail.deposit).nextElementSibling as HTMLElement;
}

function chronologie() {
  return screen.getByRole('heading', { name: fr.bookings.detail.timeline.title }).closest('section') as HTMLElement;
}

describe('BookingDetail — faits émis par l’API (TCK-1180)', () => {
  it('un acompte payé se lit dans booking_payments : badge et événement daté de paid_at', () => {
    rendre({ ...BASE, booking_payments: [{ ...ACOMPTE, status: 'paid' }] });

    expect(within(blocAcompte()).getByText(fr.bookings.paymentStatus.paid)).toBeInTheDocument();
    expect(within(chronologie()).getByText(fr.bookings.detail.timeline.depositPaid)).toBeInTheDocument();
  });

  it('un acompte en attente n’est pas annoncé payé', () => {
    rendre({ ...BASE, booking_payments: [{ ...ACOMPTE, status: 'pending', paid_at: null }] });

    expect(within(blocAcompte()).queryByText(fr.bookings.paymentStatus.paid)).toBeNull();
    expect(within(chronologie()).queryByText(fr.bookings.detail.timeline.depositPaid)).toBeNull();
  });

  it('« Expire le » se lit dans expires_at', () => {
    rendre({ ...BASE, booking_payments: [] });

    expect(screen.getByText(fr.bookings.detail.expiresAt)).toBeInTheDocument();
  });
});
