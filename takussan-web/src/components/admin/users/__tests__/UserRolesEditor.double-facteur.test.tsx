import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { putUserRole } from '@/lib/queries/admin-users';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import { UserRolesEditor } from '../UserRolesEditor';

/**
 * TCK-1203 — changer le rôle d'un membre exige la 2FA de l'agence (`UserRoleController@update`,
 * `ProtectedActions::AGENCY_TWO_FACTOR`) : le refus passe par la garde, puis l'appel est rejoué.
 */
vi.mock('@/lib/queries/admin-users', () => ({ putUserRole: vi.fn() }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });
const membre = { id: 9, first_name: 'Awa', last_name: 'Ndiaye', roles: ['agent'] } as unknown as AdminAgencyUserRow;

function monter(garde: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <UserRolesEditor user={membre} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

async function promouvoir() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: "Rôle de l'utilisateur" }));
  await user.click(await screen.findByRole('option', { name: 'Administrateur' }));
  await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));
}

describe('<UserRolesEditor> — second facteur', () => {
  beforeEach(() => {
    vi.mocked(putUserRole).mockReset();
  });

  it('un refus de second facteur ouvre la garde, puis le changement de rôle est rejoué', async () => {
    vi.mocked(putUserRole).mockRejectedValueOnce(refus()).mockResolvedValueOnce({});
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(garde);

    await promouvoir();

    await waitFor(() => expect(putUserRole).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(putUserRole).toHaveBeenLastCalledWith(9, 'agency_admin');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeDisabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche', async () => {
    vi.mocked(putUserRole).mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    monter(garde);

    await promouvoir();

    expect(await screen.findByRole('alert')).toHaveTextContent('Second facteur requis.');
    expect(garde).toHaveBeenCalledTimes(1);
    expect(putUserRole).toHaveBeenCalledTimes(1);
  });
});
