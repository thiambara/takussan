import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  BIENS: {
    data: [
      {
        id: 11,
        title: 'Villa Almadies',
        reference_number: 'REF-011',
        user_id: 7,
        owner: { id: 7, name: 'Bineta Sarr' },
      },
      { id: 12, title: 'Studio Ouakam', reference_number: 'REF-012', user_id: 8, owner: { id: 8, name: '' } },
    ],
  },
  CLIENTS: { data: [] },
  // L'utilisateur courant, qui SAISIT le bail : la ligne ne doit jamais le nommer.
  AUTH: { user: { id: 4, first_name: 'Moussa', last_name: 'Fall', full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: async () => ({ data: { id: 1 } }) },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
}));

import { CreateLeaseForm } from '../CreateLeaseForm';

async function choisirLeBien(nom: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: /^Bien/ }));
  await user.click(await screen.findByRole('option', { name: nom }));
}

/**
 * TCK-997 (P50.01) — le récapitulatif nomme le bailleur du bail, c'est-à-dire le TITULAIRE du bien
 * choisi (`LeaseService::create` : `landlord_id = property.user_id`), jamais l'utilisateur courant.
 * Avant, la ligne disait « Bailleur actif : <qui saisit> » : pour un bien saisi au nom d'un
 * bailleur, elle nommait l'agent.
 *
 * P220.08 (TCK-2142) — un titulaire sans nom est nommé par `nomAffichable()`, jamais par un vide.
 */
describe('CreateLeaseForm — la ligne « Bailleur » (TCK-997, P220.08)', () => {
  it('sans bien choisi, ne nomme personne', () => {
    render(withIntl(<CreateLeaseForm />));

    expect(screen.getByText('Bailleur : le titulaire du bien choisi')).toBeInTheDocument();
    expect(screen.queryByText(/Moussa Fall/)).toBeNull();
  });

  it('nomme le titulaire du bien choisi, pas l’utilisateur courant', async () => {
    render(withIntl(<CreateLeaseForm />));
    await choisirLeBien(/Villa Almadies/);

    expect(screen.getByText('Bailleur : Bineta Sarr')).toBeInTheDocument();
    expect(screen.queryByText(/Moussa Fall/)).toBeNull();
  });

  it('un titulaire sans nom est nommé par #<id>', async () => {
    render(withIntl(<CreateLeaseForm />));
    await choisirLeBien(/Studio Ouakam/);

    expect(screen.getByText('Bailleur : #8')).toBeInTheDocument();
  });
});
