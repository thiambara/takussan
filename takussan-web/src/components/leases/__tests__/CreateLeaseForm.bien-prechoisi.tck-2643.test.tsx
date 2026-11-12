import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2643 — `/app/leases/new?property=<id>` : venu de la fiche du bien (TCK-2639 pose les liens),
 * le bien est PRÉCHOISI. Un identifiant hors des biens proposés (bien d'une autre agence, statut
 * exclu) n'est pas retenu : le formulaire n'envoie jamais un bien que le sélecteur ne montre pas.
 *
 * Références stables (`vi.hoisted`), comme dans `CreateLeaseForm.test.tsx` (TCK-564).
 */
const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  BIENS: {
    data: [
      { id: 11, title: 'Villa Almadies', reference_number: 'REF-011', price: 250_000, currency: 'XOF', user_id: 7, owner: { id: 7, name: 'Bineta Sarr' } },
      { id: 12, title: 'Studio Plateau', reference_number: 'REF-012', price: 120_000, currency: 'XOF', user_id: 7, owner: { id: 7, name: 'Bineta Sarr' } },
    ],
  },
  CLIENTS: { data: [] },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: vi.fn(async (_valeurs: unknown) => ({ data: { id: 1 } })) },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
}));

import { CreateLeaseForm } from '../CreateLeaseForm';

describe('CreateLeaseForm — bien préchoisi par ?property= (TCK-2643)', () => {
  it('nomme le bien venu de sa fiche dans le récapitulatif, sans choix', () => {
    render(withIntl(<CreateLeaseForm propertyId={12} />));

    expect(screen.getByText('Studio Plateau · REF-012')).toBeInTheDocument();
    expect(screen.queryByText('Aucun bien sélectionné')).toBeNull();
  });

  it('envoie le bien préchoisi avec le bail', async () => {
    const user = userEvent.setup();
    MUTATION.mutateAsync.mockClear();
    render(withIntl(<CreateLeaseForm propertyId={12} />));

    // Le reste du formulaire est invalide : on ne lit que le bien retenu, via l'erreur absente du champ.
    await user.click(screen.getByRole('button', { name: 'Créer le bail' }));

    await waitFor(() => expect(document.getElementById('field-tenant_id-error')).not.toBeNull());
    expect(document.getElementById('field-property_id-error')).toBeNull();
  });

  it('ignore un bien hors des biens proposés : le champ reste à choisir', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={999} />));

    expect(screen.getByText('Aucun bien sélectionné')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer le bail' }));

    // Le récapitulatif dirait « aucun » même avec un id caché : c'est la validation qui le prouve.
    await waitFor(() => expect(document.getElementById('field-property_id-error')).not.toBeNull());
  });
});
