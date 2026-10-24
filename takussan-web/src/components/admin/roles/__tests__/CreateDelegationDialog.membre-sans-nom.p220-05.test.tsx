/**
 * P220.05 (TCK-2140) — le sélecteur du bénéficiaire d'une délégation nomme chaque membre par
 * `nomAffichable()`. Avant, un membre sans nom donnait une option vide.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CreateDelegationDialog } from '../CreateDelegationDialog';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

vi.mock('@/lib/queries/role-delegations', () => ({
  useCreateRoleDelegation: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useDelegationCandidates: () => ({
    data: {
      data: [
        { id: 21, first_name: '', last_name: '', email: 'moussa@x.sn', phone: null },
        { id: 22, first_name: '', last_name: '', email: null, phone: '+221770000622' },
        { id: 23, first_name: '', last_name: '', email: null, phone: null },
        { id: 24, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.sn', phone: null },
      ],
    },
    isLoading: false,
  }),
}));

describe('CreateDelegationDialog — membre sans nom (P220.05)', () => {
  it('propose chaque membre sous un libellé non vide', () => {
    render(withIntl(<CreateDelegationDialog agencyId={7} open onOpenChange={vi.fn()} />));

    const select = screen.getByLabelText('Bénéficiaire');
    const libelles = within(select).getAllByRole('option').slice(1).map((o) => o.textContent);
    expect(libelles).toEqual(['moussa@x.sn', '+221 77 000 06 22', '#23', 'Awa Diop']);
  });
});
