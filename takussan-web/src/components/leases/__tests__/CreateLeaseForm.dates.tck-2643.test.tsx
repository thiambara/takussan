import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2643 (L5 de la contre-vérification de e69154bd8) — les dates du bail s'écrivent comme la
 * maquette, « 1 déc. 2026 » : le jour sans zéro, le mois abrégé. Les deux sélecteurs de date
 * (`formatAffiche="d MMM yyyy"`) et la durée de l'étape « Vérifier » (`DATE_DU_BAIL`). Aucun test ne
 * l'épinglait : « 01 déc. 2026 » passait vert.
 *
 * Le sélecteur de date est le VRAI (`FormDatePicker` n'est pas doublé ici, contrairement aux autres
 * fichiers de `CreateLeaseForm`) : c'est son libellé qui est jugé. Les dates viennent d'une
 * réservation, seul chemin qui les préremplit.
 */
const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION, RESERVATION } = vi.hoisted(() => ({
  BIENS: { data: [{ id: 2, title: 'Villa Almadies', user_id: 7, owner: { id: 7, name: 'Bineta Sarr' } }] },
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
        start_date: '2026-12-01T00:00:00.000000Z',
        end_date: '2027-11-30T00:00:00.000000Z',
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
  useLeaseDefaults: () => ({ data: undefined }),
  useLeaseCustomer: () => ({ data: undefined }),
  useDemanderLaSignature: () => ({ mutateAsync: async () => ({ data: {} }) }),
}));
vi.mock('@/lib/queries/bookings', () => ({ useBooking: () => RESERVATION }));

import { CreateLeaseForm } from '../CreateLeaseForm';

const espaces = (texte: string | null | undefined) => (texte ?? '').replace(/[  ]/g, ' ').trim();

describe('CreateLeaseForm — les dates « 1 déc. 2026 » (TCK-2643, L5)', () => {
  it('les sélecteurs de début et de fin écrivent le jour sans zéro et le mois abrégé', () => {
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    expect(espaces(screen.getByLabelText(/^Début/).textContent)).toBe('1 déc. 2026');
    expect(espaces(screen.getByLabelText(/^Fin/).textContent)).toBe('30 nov. 2027');
  });

  it('l’étape « Vérifier » dit la durée « 1 déc. 2026 → 30 nov. 2027 »', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    while (screen.queryByRole('button', { name: 'Continuer' })) {
      await user.click(screen.getByRole('button', { name: 'Continuer' }));
    }

    const duree = await waitFor(() => screen.getByText('Durée'));
    const ligne = duree.closest('div') ?? duree.parentElement!;
    expect(espaces(within(ligne).getByText(/→/).textContent)).toBe('1 déc. 2026 → 30 nov. 2027');
  });
});
