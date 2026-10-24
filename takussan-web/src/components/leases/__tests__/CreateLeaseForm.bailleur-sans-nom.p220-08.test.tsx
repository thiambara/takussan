import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  BIENS: { data: [] },
  CLIENTS: { data: [] },
  AUTH: {
    user: {
      id: 4,
      first_name: '',
      last_name: '',
      full_name: '',
      email: null as string | null,
      phone: '+221770000622' as string | null,
    },
  },
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
 * P220.08 (TCK-2142) — le récapitulatif de création d'un bail nomme le bailleur actif par
 * `nomAffichable()`. Avant, un particulier sans nom lisait « Bailleur actif :  ».
 */
describe('CreateLeaseForm — bailleur actif sans nom (P220.08)', () => {
  it('nomme le bailleur par son numéro', () => {
    render(withIntl(<CreateLeaseForm />));

    expect(screen.getByText('Bailleur actif : +221 77 000 06 22')).toBeInTheDocument();
  });

  it('sans numéro non plus, par #<id>', () => {
    AUTH.user.phone = null;
    render(withIntl(<CreateLeaseForm />));

    expect(screen.getByText('Bailleur actif : #4')).toBeInTheDocument();
  });
});
