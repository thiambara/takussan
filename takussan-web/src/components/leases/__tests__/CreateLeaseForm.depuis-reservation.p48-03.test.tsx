import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * P48.03 (TCK-2352) — le bail tiré d'une candidature : `/app/leases/new?booking_id=…` préremplit
 * le bien, le locataire (le client de la réservation), les dates et le loyer, et envoie
 * `booking_id`. Les parties ne se choisissent plus : l'API refuse un autre locataire.
 *
 * Références stables (`vi.hoisted`), comme dans `CreateLeaseForm.test.tsx` (TCK-564).
 */
const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION, RESERVATION } = vi.hoisted(() => ({
  BIENS: { data: [] },
  CLIENTS: { data: [] },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: vi.fn(async (_valeurs: unknown) => ({ data: { id: 1 } })) },
  RESERVATION: {
    data: {
      data: {
        id: 7,
        property_id: 2,
        customer_id: 21,
        status: 'confirmed',
        reference_number: 'BK-7',
        start_date: '2099-01-01T00:00:00.000000Z',
        end_date: '2099-12-31T00:00:00.000000Z',
        property: { id: 2, title: 'Villa Almadies', slug: 'villa', price: 250_000, currency: 'XOF', contract_type: 'rent' },
        customer: { id: 21, user_id: null, first_name: 'Awa', last_name: 'Diop' },
      },
    },
    isLoading: false,
    isError: false,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
}));
vi.mock('@/lib/queries/bookings', () => ({ useBooking: () => RESERVATION }));

import { CreateLeaseForm } from '../CreateLeaseForm';

describe('CreateLeaseForm — depuis une réservation (P48.03)', () => {
  it('nomme la réservation et ses parties, sans choix de bien ni de locataire', () => {
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    expect(screen.getByText(/BK-7/)).toBeInTheDocument();
    expect(screen.getByText('Villa Almadies')).toBeInTheDocument();
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Bien/ })).toBeNull();
    expect(document.getElementById('field-tenant_id')).toBeNull();
  });

  it('envoie le bail prérempli avec la réservation', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    await user.click(screen.getByRole('button', { name: 'Créer le bail' }));

    await waitFor(() => expect(MUTATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(MUTATION.mutateAsync.mock.calls[0]![0]).toMatchObject({
      property_id: 2,
      tenant_id: 21,
      booking_id: 7,
      start_date: '2099-01-01',
      end_date: '2099-12-31',
      monthly_rent: 250_000,
    });
  });
});
