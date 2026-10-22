import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { BookingDetail } from '../BookingDetail';
import { useCanAll } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { ToastProvider } from '@/components/ui/toast';

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
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderBooking(booking: Record<string, unknown>) {
  vi.mocked(useBooking).mockReturnValue({
    data: {
      data: {
        id: 1,
        agency_id: 5,
        reference_number: 'BK-1',
        property: { id: 2, title: 'Villa', slug: 'villa' },
        customer: { user_id: 999 },
        payments: [],
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
 * TCK-1301 (P115.01) — l'API refuse d'annuler un séjour `confirmed` commencé
 * (`422 booking.cannot_cancel`) : le bouton ne s'offre plus au client.
 */
describe('BookingDetail — un séjour commencé ne s’annule plus (TCK-1301)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 10, 0, 0));
    vi.mocked(useCanAll).mockReturnValue({ can: true, isLoading: false });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 999, roles: ['customer'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cache « Annuler » quand le séjour confirmé commence aujourd’hui', () => {
    renderBooking({ status: 'confirmed', start_date: '2026-11-02', end_date: '2026-11-05' });
    expect(screen.queryByRole('button', { name: 'Annuler la réservation' })).toBeNull();
  });

  it('cache « Annuler » quand le séjour confirmé est fini', () => {
    renderBooking({ status: 'confirmed', start_date: '2026-10-23', end_date: '2026-10-30' });
    expect(screen.queryByRole('button', { name: 'Annuler la réservation' })).toBeNull();
  });

  it('garde « Annuler » pour un séjour confirmé qui commence demain', () => {
    renderBooking({ status: 'confirmed', start_date: '2026-11-03', end_date: '2026-11-05' });
    expect(screen.getByRole('button', { name: 'Annuler la réservation' })).toBeInTheDocument();
  });

  it('garde « Annuler » pour une demande en attente, même datée du passé', () => {
    renderBooking({ status: 'pending', start_date: '2026-10-23', end_date: '2026-10-30' });
    expect(screen.getByRole('button', { name: 'Annuler la réservation' })).toBeInTheDocument();
  });
});
