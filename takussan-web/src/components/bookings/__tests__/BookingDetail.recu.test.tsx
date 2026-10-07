/**
 * TCK-593 (Partie 1, AC1) — le reçu d'acompte se télécharge depuis l'ORIGINE DE L'API, avec le
 * jeton de session.
 *
 * Le lien était `<a href="/api/booking-payments/{id}/receipt">` : relatif, il frappait l'origine
 * Next (404), sans `Bearer`. Restaurer ce lien fait rougir ce test.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const BOOKING = {
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
      status: 'paid',
      payment_type: 'deposit',
      payment_method: 'wave',
      payment_date: '2026-09-01T10:00:00+00:00',
      created_at: '2026-09-01T10:00:00+00:00',
      transaction_id: null,
    },
  ],
  notes: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.mocked(useBooking).mockReturnValue({
    data: { data: BOOKING },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useBooking>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rendre() {
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={1} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — reçu d’acompte (TCK-593 AC1)', () => {
  it('télécharge depuis l’API avec le Bearer, pas par un lien relatif', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 }));
    rendre();

    expect(screen.queryByRole('link', { name: fr.bookings.detail.receipt })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.detail.receipt }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const origine = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');
    expect(url).toBe(`${origine}/api/booking-payments/44/receipt`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-client');
  });

  it('un 422 se lit dans la langue de l’utilisateur', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Receipt not available.' }), { status: 422 }),
    );
    rendre();
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.detail.receipt }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.documents.download.errors.indisponible);
  });
});
