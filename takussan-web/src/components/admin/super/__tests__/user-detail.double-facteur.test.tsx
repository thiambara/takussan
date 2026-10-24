import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { deleteAdminUserSession, postUserSupportAction } from '@/lib/queries/super-admin';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { AdminUserSession } from '@/types/super-admin';
import { UserSessionsTable, UserSupportActionsMenu } from '../user-detail';

/**
 * TCK-1203 — les gestes de support (`UserSupportController@unlock|reset2fa|revokeSessions|destroySession`)
 * exigent un step-up : le refus doit ouvrir la garde, puis le geste est rejoué.
 */
vi.mock('@/lib/queries/super-admin', () => ({
  deleteAdminUserSession: vi.fn(),
  fetchAdminUserActivity: vi.fn(),
  fetchAdminUserDetail: vi.fn(),
  fetchAdminUserSessions: vi.fn(),
  postUserSupportAction: vi.fn(),
  requestAdminUserDataExport: vi.fn(),
}));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

const session = {
  id: 11,
  name: 'iPhone',
  last_used_at: null,
  expires_at: null,
} as unknown as AdminUserSession;

function monter(node: React.ReactNode, garde: GardeDoubleFacteurFn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ContexteGardeDoubleFacteur.Provider value={garde}>{avecGestes(node)}</ContexteGardeDoubleFacteur.Provider>
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

async function confirmerAvecMotif(bouton: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: bouton }));
  await user.type(await screen.findByRole('textbox'), 'Demande du titulaire.');
  await user.click(screen.getByRole('button', { name: 'Confirmer' }));
}

describe('fiche utilisateur — second facteur', () => {
  beforeEach(() => vi.resetAllMocks());

  it('un geste de support : la garde s’ouvre, puis le geste est rejoué', async () => {
    vi.mocked(postUserSupportAction)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ success: true, action_id: 1 });
    const garde = vi.fn().mockResolvedValue(true);
    monter(<UserSupportActionsMenu userId={5} locked />, garde);

    await confirmerAvecMotif('Débloquer le compte');

    expect(await screen.findByText('Action support exécutée')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(postUserSupportAction).toHaveBeenCalledTimes(2);
    expect(postUserSupportAction).toHaveBeenLastCalledWith(5, 'unlock', 'Demande du titulaire.');
  });

  it('un geste de support, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(postUserSupportAction).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(<UserSupportActionsMenu userId={5} locked />, garde);

    await confirmerAvecMotif('Débloquer le compte');

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(postUserSupportAction).toHaveBeenCalledTimes(1);
  });

  it('révoquer une session : la garde s’ouvre, puis la révocation est rejouée', async () => {
    vi.mocked(deleteAdminUserSession)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ success: true, action_id: 2 });
    const garde = vi.fn().mockResolvedValue(true);
    monter(<UserSessionsTable userId={5} sessions={[session]} loading={false} />, garde);

    await confirmerAvecMotif('Révoquer');

    expect(await screen.findByText('Session révoquée')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(deleteAdminUserSession).toHaveBeenCalledTimes(2);
  });

  it('révoquer une session, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(deleteAdminUserSession).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(<UserSessionsTable userId={5} sessions={[session]} loading={false} />, garde);

    await confirmerAvecMotif('Révoquer');

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(deleteAdminUserSession).toHaveBeenCalledTimes(1);
  });
});
