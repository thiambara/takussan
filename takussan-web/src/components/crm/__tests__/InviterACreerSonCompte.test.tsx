/**
 * P15.01 (TCK-2351) — « inviter le locataire à créer son compte », depuis la fiche : le geste
 * part une fois, dit qu'il est parti, et affiche le refus de l'API tel qu'elle le dit.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { InviterACreerSonCompte } from '../InviterACreerSonCompte';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const inviteCustomerToAccount = vi.fn();
vi.mock('@/lib/queries/customers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customers')>()),
  inviteCustomerToAccount: (...a: unknown[]) => inviteCustomerToAccount(...a),
}));

function rendu() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <InviterACreerSonCompte customerId={9} />
    </QueryClientProvider>,
  ));
}

describe('InviterACreerSonCompte', () => {
  beforeEach(() => {
    inviteCustomerToAccount.mockReset();
  });

  it('envoie l’invitation de la fiche, puis dit qu’elle est partie et ne repart pas', async () => {
    inviteCustomerToAccount.mockResolvedValue(undefined);
    rendu();

    await userEvent.click(screen.getByRole('button', { name: 'Inviter à créer son compte' }));

    await waitFor(() => expect(inviteCustomerToAccount).toHaveBeenCalledWith('jeton', 9));
    expect(await screen.findByRole('status')).toHaveTextContent('Invitation envoyée.');
    expect(screen.queryByRole('button', { name: 'Inviter à créer son compte' })).toBeNull();
  });

  it('affiche le refus de l’API tel qu’elle le dit', async () => {
    inviteCustomerToAccount.mockRejectedValue(
      new ApiError(409, {
        code: 'customer.invite_already_linked',
        message: 'Cette fiche est déjà rattachée à un compte : il n’y a personne à inviter.',
      }),
    );
    rendu();

    await userEvent.click(screen.getByRole('button', { name: 'Inviter à créer son compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette fiche est déjà rattachée à un compte');
    expect(screen.getByRole('button', { name: 'Inviter à créer son compte' })).toBeEnabled();
  });
});
