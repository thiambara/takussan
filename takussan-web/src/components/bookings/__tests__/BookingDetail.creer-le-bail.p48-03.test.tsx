import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * P48.03 (TCK-2352) — « Créer le bail » depuis une candidature confirmée. Le geste ouvre le
 * formulaire du bail prérempli (`/app/leases/new?booking_id=…`) ; l'API vérifie que le locataire
 * est le client de la réservation, et la passe à `completed`.
 */
const CANDIDATURE = {
  id: 7,
  agency_id: 5,
  status: 'confirmed',
  reference_number: 'BK-7',
  start_date: '2099-01-01',
  end_date: '2099-12-31',
  property: { id: 2, title: 'Villa', slug: 'villa', price: 250_000, currency: 'XOF', contract_type: 'rent' },
  customer: { id: 21, user_id: 999 },
  payments: [],
  notes: null,
};

function rendu(booking: Record<string, unknown>, capacites: readonly string[]) {
  vi.mocked(useBooking).mockReturnValue({
    data: { data: booking },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useBooking>);
  vi.mocked(useCanAll).mockImplementation((demandees) => ({
    can: demandees.every((c) => capacites.includes(c)),
    isLoading: false,
  }));
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={7} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — « Créer le bail » (P48.03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 3, roles: ['agent'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('mène au bail prérempli depuis une candidature confirmée à louer', () => {
    rendu(CANDIDATURE, ['leases.create']);

    expect(screen.getByRole('link', { name: 'Créer le bail' })).toHaveAttribute(
      'href',
      '/app/leases/new?booking_id=7',
    );
  });

  it('ne se montre pas sans leases.create', () => {
    rendu(CANDIDATURE, ['bookings.validate']);

    expect(screen.queryByRole('link', { name: 'Créer le bail' })).toBeNull();
  });

  it('ne se montre pas sur une demande en attente', () => {
    rendu({ ...CANDIDATURE, status: 'pending' }, ['leases.create']);
    expect(screen.queryByRole('link', { name: 'Créer le bail' })).toBeNull();
  });

  it('ne se montre pas sur un bien à vendre', () => {
    rendu({ ...CANDIDATURE, property: { ...CANDIDATURE.property, contract_type: 'sale' } }, ['leases.create']);
    expect(screen.queryByRole('link', { name: 'Créer le bail' })).toBeNull();
  });
});
