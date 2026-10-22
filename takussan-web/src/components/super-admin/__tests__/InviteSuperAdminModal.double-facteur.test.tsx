import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { inviteSuperAdmin } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { InviteSuperAdminModal } from '../InviteSuperAdminModal';

/**
 * TCK-1203 — coopter un opérateur (`SuperAdminInvitationController@store`) exige un step-up : le
 * refus doit ouvrir la garde, puis l'invitation est rejouée.
 */
vi.mock('@/lib/queries/super-admin', () => ({ inviteSuperAdmin: vi.fn() }));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn, onInvited = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <ContexteGardeDoubleFacteur.Provider value={garde}>
            <InviteSuperAdminModal open onOpenChange={() => {}} onInvited={onInvited} />
          </ContexteGardeDoubleFacteur.Provider>
        </QueryClientProvider>
      </ToastProvider>,
    ),
  );
}

async function remplirEtEnvoyer() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), 'new@takussan.app');
  await user.type(screen.getByLabelText(/prénom/i), 'Awa');
  await user.type(screen.getByLabelText(/^Nom$/i), 'Ndiaye');
  await user.click(screen.getByRole('button', { name: /envoyer l’invitation/i }));
}

describe('<InviteSuperAdminModal> — second facteur', () => {
  beforeEach(() => vi.resetAllMocks());

  it('un refus de step-up ouvre la garde, puis l’invitation est rejouée', async () => {
    vi.mocked(inviteSuperAdmin).mockRejectedValueOnce(refus()).mockResolvedValueOnce({} as never);
    const garde = vi.fn().mockResolvedValue(true);
    const onInvited = vi.fn();
    monter(garde, onInvited);

    await remplirEtEnvoyer();

    await waitFor(() => expect(onInvited).toHaveBeenCalledTimes(1));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(inviteSuperAdmin).toHaveBeenCalledTimes(2);
  });

  it('garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(inviteSuperAdmin).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    const onInvited = vi.fn();
    monter(garde, onInvited);

    await remplirEtEnvoyer();

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(inviteSuperAdmin).toHaveBeenCalledTimes(1);
    expect(onInvited).not.toHaveBeenCalled();
  });
});
