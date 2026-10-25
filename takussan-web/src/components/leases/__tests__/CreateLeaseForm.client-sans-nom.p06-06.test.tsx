import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  BIENS: { data: [] },
  CLIENTS: {
    data: [
      { id: 7, first_name: '', last_name: '', full_name: '', email: null, phone: null, status: 'active' },
    ],
  },
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
 * P06.06 (TCK-2336) — un locataire sans nom se nommait « Customer #<id> » dans l'interface
 * FRANÇAISE : la valeur `fr` de `lease.form.customerFallback` était restée en anglais.
 */
describe('CreateLeaseForm — locataire sans nom (P06.06)', () => {
  it('se nomme « Client #<id> » en français', async () => {
    render(withIntl(<CreateLeaseForm />));

    await userEvent.click(screen.getByRole('combobox', { name: /^Locataire/ }));

    expect(await screen.findByRole('option', { name: 'Client #7' })).toBeInTheDocument();
    expect(screen.queryByText(/Customer/)).not.toBeInTheDocument();
  });
});
