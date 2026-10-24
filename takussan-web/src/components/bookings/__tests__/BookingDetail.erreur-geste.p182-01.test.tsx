/**
 * P182.01 — une erreur de l'API sur « Accepter », « Refuser » ou « Annuler » s'affiche dans le
 * dialogue, qui reste ouvert. Avant, la promesse rejetée n'était rattrapée par rien : ni message,
 * ni bandeau, et le dialogue restait ouvert sans rien dire.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { BookingDetail } from '../BookingDetail';
import { ApiError } from '@/lib/api';
import { ToastProvider } from '@/components/ui/toast';

const confirmer = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const annuler = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('@/hooks/useCan', () => ({ useCanAll: () => ({ can: true, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, roles: ['agency_admin'] }, token: 'tok' }),
}));
vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: [] }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: () => ({
    data: {
      data: {
        id: 1,
        agency_id: 5,
        status: 'pending',
        reference_number: 'BK-1',
        property: { id: 2, title: 'Villa', slug: 'villa' },
        customer: { user_id: 999 },
        payments: [],
        notes: null,
      },
    },
    isLoading: false,
    isError: false,
  }),
  useCancelBooking: () => annuler,
  useConfirmBooking: () => confirmer,
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const MESSAGE_API = 'Ces dates chevauchent une réservation confirmée.';

function renderDetail() {
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={1} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — erreur d’un geste de transition (P182.01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le message de l’API dans le dialogue d’acceptation, qui reste ouvert', async () => {
    confirmer.mutateAsync.mockRejectedValue(new ApiError(422, { message: MESSAGE_API }));
    renderDetail();

    await userEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    const dialogue = await screen.findByRole('dialog');
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Accepter' }));

    expect(confirmer.mutateAsync).toHaveBeenCalledTimes(1);
    expect(await within(dialogue).findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('affiche le message de l’API dans le dialogue d’annulation, et l’efface au nouvel essai', async () => {
    annuler.mutateAsync.mockRejectedValueOnce(new ApiError(422, { message: MESSAGE_API }));
    annuler.mutateAsync.mockResolvedValueOnce({});
    renderDetail();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler la réservation' }));
    const dialogue = await screen.findByRole('dialog');
    await userEvent.type(within(dialogue).getByRole('textbox'), 'Indisponible');
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Annuler la réservation' }));

    expect(await within(dialogue).findByRole('alert')).toHaveTextContent(MESSAGE_API);

    await userEvent.click(within(dialogue).getByRole('button', { name: 'Annuler la réservation' }));

    expect(annuler.mutateAsync).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(MESSAGE_API)).toBeNull();
  });
});
