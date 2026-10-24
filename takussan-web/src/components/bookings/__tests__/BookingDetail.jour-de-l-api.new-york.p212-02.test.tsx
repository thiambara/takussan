/**
 * P212.02 — « commencé » se juge sur le jour UTC, celui de l'API (`BookingService::cancel`,
 * `start_date <= now()->toDateString()`, fuseau UTC), pas sur le jour du navigateur.
 * Navigateur à New York, fixé AVANT toute date.
 */
process.env.TZ = 'America/New_York';

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

describe('BookingDetail — séjour commencé au jour de l’API, navigateur à New York (P212.02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
    vi.mocked(useCanAll).mockReturnValue({ can: true, isLoading: false });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 999, roles: ['customer'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('à 01:00 Z le 25 (21:00 le 24 à New York), un séjour du 25 est commencé : pas d’« Annuler »', () => {
    renderBooking({ status: 'confirmed', start_date: '2026-10-25', end_date: '2026-10-28' });
    expect(screen.queryByRole('button', { name: 'Annuler la réservation' })).toBeNull();
  });
});
