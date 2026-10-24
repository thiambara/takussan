/**
 * P210.02 (TCK-2082) — le bouton de paiement du client (`CustomerPayCta`) dit le refus de l'API
 * sous le bouton, par `useMessageErreurApi()` (ADR-0019) : un 422 `booking_payment.nothing_due`
 * (paiement acquitté pendant que la fiche montrait encore le bouton) laissait le client sans rien.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { BookingDetail } from '../BookingDetail';
import { useCanAll } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';

const createPayment = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

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

const MESSAGE_API = 'Plus rien n’est dû sur cette réservation';

describe('BookingDetail — le paiement du client refusé se dit (P210.02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPayment.mutateAsync.mockReset();
    vi.mocked(useCanAll).mockReturnValue({ can: false, isLoading: false });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 999, roles: ['customer'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('un refus de l’API affiche son message sous le bouton', async () => {
    createPayment.mutateAsync.mockRejectedValue(new ApiError(422, { message: MESSAGE_API }));
    renderBooking({});

    await userEvent.click(screen.getByRole('button', { name: 'Payer l’acompte' }));

    expect(createPayment.mutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(screen.getByRole('button', { name: 'Payer l’acompte' })).toBeEnabled();
  });

  it('un nouvel essai réussi efface le message', async () => {
    createPayment.mutateAsync
      .mockRejectedValueOnce(new ApiError(422, { message: MESSAGE_API }))
      .mockResolvedValueOnce({});
    renderBooking({});

    await userEvent.click(screen.getByRole('button', { name: 'Payer l’acompte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);

    await userEvent.click(screen.getByRole('button', { name: 'Payer l’acompte' }));
    await waitFor(() => expect(createPayment.mutateAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
