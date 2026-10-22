import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { BookingDetail } from '../BookingDetail';
import { useCanAll } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { ToastProvider } from '@/components/ui/toast';

const createPayment = vi.hoisted(() => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }));

vi.mock('@/hooks/useCan', () => ({ useCanAll: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: ['wave'] }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => createPayment,
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderBooking(booking: Record<string, unknown>) {
  vi.mocked(useBooking).mockReturnValue({
    data: {
      data: {
        id: 1,
        agency_id: 5,
        reference_number: 'BK-1',
        status: 'confirmed',
        total_amount: 100000,
        deposit_amount: 30000,
        start_date: '2099-01-10',
        end_date: '2099-01-12',
        property: { id: 2, title: 'Villa', slug: 'villa' },
        customer: { user_id: 999 },
        payments: [],
        booking_payments: [],
        notes: null,
        ...booking,
      },
    },
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

/**
 * TCK-1309 (P133.05) — le montant d'un paiement de réservation est dérivé par l'API : le
 * navigateur n'envoie plus ni montant ni nature, seulement la demande de paiement en ligne.
 */
describe('BookingDetail — le client ne fixe plus le montant (TCK-1309)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCanAll).mockReturnValue({ can: false, isLoading: false });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 999, roles: ['customer'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('« Payer l’acompte » poste une demande sans montant', async () => {
    renderBooking({});
    await userEvent.click(screen.getByRole('button', { name: 'Payer l’acompte' }));

    expect(createPayment.mutateAsync).toHaveBeenCalledTimes(1);
    const payload = createPayment.mutateAsync.mock.calls[0][0];
    expect(payload).toEqual({ status: 'pending' });
  });

  it('« Payer le solde » poste aussi une demande sans montant', async () => {
    renderBooking({
      booking_payments: [{ id: 3, amount: 30000, status: 'paid', payment_type: 'deposit' }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Payer le solde' }));

    expect(createPayment.mutateAsync.mock.calls[0][0]).toEqual({ status: 'pending' });
  });
});
