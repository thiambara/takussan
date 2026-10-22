import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { inviteServiceProvider } from '@/lib/queries/service-providers';
import { withIntl } from '@/test/intl';
import { InviteServiceProviderSheet } from '../InviteServiceProviderSheet';

/**
 * TCK-1203 — inviter un prestataire exige la 2FA de l'agence (`ServiceProviderInvitationController`,
 * `ProtectedActions::AGENCY_TWO_FACTOR`) : le refus passe par la garde, puis l'invitation est rejouée.
 */
vi.mock('@/lib/queries/service-providers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/service-providers')>()),
  inviteServiceProvider: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <InviteServiceProviderSheet open onOpenChange={onOpenChange} agencyId={7} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
  return onOpenChange;
}

async function inviter() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'awa@exemple.sn');
  await user.type(screen.getByLabelText('Prénom'), 'Awa');
  await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
  await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }));
}

describe('<InviteServiceProviderSheet> — second facteur', () => {
  beforeEach(() => {
    vi.mocked(inviteServiceProvider).mockReset();
    toastAdd.mockReset();
  });

  it('un refus de second facteur ouvre la garde, puis l’invitation est rejouée', async () => {
    vi.mocked(inviteServiceProvider).mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: { id: 1 }, meta: {} } as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onOpenChange = monter(garde);

    await inviter();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(inviteServiceProvider).toHaveBeenCalledTimes(2);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('garde abandonnée : pas de rejeu, l’échec est dit et la fenêtre reste ouverte', async () => {
    vi.mocked(inviteServiceProvider).mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const onOpenChange = monter(garde);

    await inviter();

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(garde).toHaveBeenCalledTimes(1);
    expect(inviteServiceProvider).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
