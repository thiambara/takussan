import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  BIENS: { data: [] },
  CLIENTS: { data: [] },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
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

/**
 * TCK-1030 (P68.02) — le libellé « Locataire » vise le champ de recherche, et le choix du
 * locataire n'a pas de libellé visible : son déclencheur n'avait aucun nom accessible (axe
 * `button-name`, « critical »). Le lecteur d'écran n'annonçait que le placeholder.
 */
describe('CreateLeaseForm — nom accessible du choix du locataire (TCK-1030)', () => {
  it('le déclencheur du locataire se nomme « Locataire »', () => {
    render(withIntl(<CreateLeaseForm />));
    const declencheur = screen.getByRole('combobox', { name: /^Locataire/ });
    expect(declencheur.id).toBe('field-tenant_id');
  });
});
