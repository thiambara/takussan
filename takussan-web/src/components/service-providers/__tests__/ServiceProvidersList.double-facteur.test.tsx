import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * TCK-1203 — relancer ou révoquer l'invitation d'un prestataire exige la 2FA de l'agence
 * (`InvitationController@resend` / `@revoke`) : le refus passe par la garde, puis le geste est
 * rejoué. L'invitation est celle que porte la ligne (`pending_invitation_id`, P237.01).
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

const donnees = {
  data: [{
    id: 3, user_id: 9, agency_id: 7, status: 'draft', metadata: null, created_at: null,
    pending_invitation_id: 44,
    user: { id: 9, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
    trades: [], intervention_zones: [],
  }],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

/** Le geste protégé échoue `refusals` fois sur un refus de second facteur, puis aboutit. */
function api(geste: 'resend' | 'revoke', refusals: number) {
  let refuses = 0;
  apiRequestMock.mockImplementation(async (chemin: string) => {
    if (chemin === `/api/invitations/44/${geste}`) {
      if (refuses < refusals) {
        refuses += 1;
        throw refus();
      }
      return { data: { id: 44 } };
    }
    return donnees;
  });
}

const appelsDuGeste = (geste: string) =>
  apiRequestMock.mock.calls.filter(([chemin]) => chemin === `/api/invitations/44/${geste}`).length;

function monter(garde: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

describe('<ServiceProvidersList> — invitations et second facteur', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    toastAdd.mockReset();
  });

  it.each([
    ['resend', "Renvoyer l'invitation"],
    ['revoke', 'Révoquer'],
  ] as const)('%s : un refus de second facteur ouvre la garde, puis le geste est rejoué', async (geste, libelle) => {
    api(geste, 1);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(garde);

    await userEvent.click(await screen.findByRole('button', { name: libelle }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(appelsDuGeste(geste)).toBe(2);
  });

  it('garde abandonnée : pas de rejeu, l’échec est dit', async () => {
    api('resend', 99);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    monter(garde);

    await userEvent.click(await screen.findByRole('button', { name: "Renvoyer l'invitation" }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      description: 'Second facteur requis.',
    })));
    expect(garde).toHaveBeenCalledTimes(1);
    expect(appelsDuGeste('resend')).toBe(1);
  });
});
