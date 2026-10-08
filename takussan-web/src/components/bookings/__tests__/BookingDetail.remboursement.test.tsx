import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { BookingDetail } from '../BookingDetail';
import { useCanAll } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { ToastProvider } from '@/components/ui/toast';

const etat = vi.hoisted(() => ({ refund: vi.fn() }));

vi.mock('@/hooks/useCan', () => ({ useCanAll: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: [] }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: etat.refund, isPending: false }),
}));

const CLIENT_ID = 999;
const PAYE = {
  id: 41,
  booking_id: 1,
  amount: 15000,
  currency: 'XOF',
  payment_type: 'deposit',
  payment_method: 'cash',
  status: 'paid',
  created_at: '2026-10-01T10:00:00Z',
};

function reservation(extra: Record<string, unknown>) {
  return {
    id: 1,
    agency_id: 5,
    status: 'cancelled',
    reference_number: 'BK-1',
    property: { id: 2, title: 'Villa', slug: 'villa' },
    customer: { user_id: CLIENT_ID },
    booking_payments: [PAYE],
    notes: null,
    ...extra,
  };
}

function monter(booking: Record<string, unknown>, user: { id: number; roles: string[] }) {
  vi.mocked(useBooking).mockReturnValue({
    data: { data: booking },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useBooking>);
  vi.mocked(useAuth).mockReturnValue({ user, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={1} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — acompte d’une réservation fermée (TCK-596 AC5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.refund.mockResolvedValue({ data: {} });
    vi.mocked(useCanAll).mockReturnValue({ can: false, isLoading: false });
  });

  it('le client lit « remboursement en cours », sans geste', () => {
    monter(reservation({ refund_status: 'pending', can_refund: false }), { id: CLIENT_ID, roles: ['customer'] });

    const panneau = screen.getByTestId('booking-refund-panel');
    expect(within(panneau).getByRole('heading', { name: 'Remboursement en cours' })).toBeInTheDocument();
    expect(within(panneau).queryByRole('button', { name: 'Rembourser' })).not.toBeInTheDocument();
  });

  it('le client lit « remboursé » une fois l’acompte rendu', () => {
    monter(
      reservation({ refund_status: 'refunded', can_refund: false, booking_payments: [{ ...PAYE, status: 'refunded' }] }),
      { id: CLIENT_ID, roles: ['customer'] },
    );

    expect(within(screen.getByTestId('booking-refund-panel')).getByRole('heading', { name: 'Remboursé' })).toBeInTheDocument();
  });

  it('sans état de remboursement, aucun bloc', () => {
    monter(reservation({ status: 'confirmed', refund_status: null }), { id: CLIENT_ID, roles: ['customer'] });

    expect(screen.queryByTestId('booking-refund-panel')).not.toBeInTheDocument();
  });

  it('qui peut rembourser voit « à traiter » et rembourse le paiement encaissé', async () => {
    monter(reservation({ refund_status: 'pending', can_refund: true }), { id: 3, roles: ['agency_admin'] });

    const panneau = screen.getByTestId('booking-refund-panel');
    expect(within(panneau).getByRole('heading', { name: 'Remboursement à traiter' })).toBeInTheDocument();
    fireEvent.click(within(panneau).getByRole('button', { name: 'Rembourser' }));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByLabelText(/Montant remboursé/)).toHaveValue(15000);
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer le remboursement' }));

    await waitFor(() =>
      expect(etat.refund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 41, refund_amount: 15000 })),
    );
  });

  it('un agent sans le droit voit ce qui reste à traiter, sans le geste', () => {
    monter(reservation({ refund_status: 'pending', can_refund: false }), { id: 4, roles: ['agent'] });

    const panneau = screen.getByTestId('booking-refund-panel');
    expect(within(panneau).getByRole('heading', { name: 'Remboursement à traiter' })).toBeInTheDocument();
    expect(within(panneau).queryByRole('button', { name: 'Rembourser' })).not.toBeInTheDocument();
  });
});
