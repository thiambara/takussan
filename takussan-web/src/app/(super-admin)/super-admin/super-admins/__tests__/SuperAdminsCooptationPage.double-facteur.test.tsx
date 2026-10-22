import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import {
  fetchSuperAdminListing,
  resendSuperAdminInvitation,
  revokePlatformOperator,
  revokeSuperAdminInvitation,
  type SuperAdminCooptationListing,
} from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import SuperAdminsCooptationPage from '../page';

/**
 * TCK-1203 — retirer un opérateur, relancer et annuler une invitation
 * (`SuperAdminInvitationController@revokeOperator|resend|revoke`) exigent un step-up : le refus doit
 * ouvrir la garde, puis le geste est rejoué.
 */
vi.mock('@/lib/queries/super-admin', () => ({
  fetchSuperAdminListing: vi.fn(),
  inviteSuperAdmin: vi.fn(),
  resendSuperAdminInvitation: vi.fn(),
  revokeSuperAdminInvitation: vi.fn(),
  revokePlatformOperator: vi.fn(),
}));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

const LISTING: SuperAdminCooptationListing = {
  super_admins: [
    {
      id: 1,
      level: 'super_admin',
      first_name: 'Awa',
      last_name: 'Diop',
      email: 'awa@takussan.app',
      status: 'active',
      two_factor_enabled: true,
      force_2fa_at_first_login: false,
      last_login_at: null,
      created_at: null,
    },
  ],
  pending_invitations: [
    {
      id: 7,
      email: 'coopte@takussan.app',
      role: 'super_admin',
      status: 'sent',
      agency_id: null,
      invited_by: 1,
      expires_at: '2026-09-03T10:00:00+00:00',
      created_at: '2026-08-27T10:00:00+00:00',
      is_expired: false,
      metadata: null,
    },
  ],
};

function monter(garde: GardeDoubleFacteurFn) {
  vi.mocked(fetchSuperAdminListing).mockResolvedValue(LISTING);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <ContexteGardeDoubleFacteur.Provider value={garde}>
            <SuperAdminsCooptationPage />
          </ContexteGardeDoubleFacteur.Provider>
        </QueryClientProvider>
        <Toaster />
      </ToastProvider>,
    ),
  );
}

async function retirerOperateur() {
  const user = userEvent.setup();
  await user.click(within(await screen.findByTestId('operator-1')).getByRole('button', { name: 'Retirer' }));
  await user.type(screen.getByTestId('confirm-action-reason'), 'Départ de l’équipe.');
  await user.type(screen.getByTestId('confirm-action-input'), 'RETIRER');
  await user.click(screen.getByTestId('confirm-action-submit'));
}

const ANNULER = /^Annuler l’invitation$|^Annuler l'invitation$/;

describe('<SuperAdminsCooptationPage> — second facteur', () => {
  beforeEach(() => vi.resetAllMocks());

  it('retirer un opérateur : la garde s’ouvre, puis le retrait est rejoué', async () => {
    vi.mocked(revokePlatformOperator).mockRejectedValueOnce(refus()).mockResolvedValueOnce({});
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await retirerOperateur();

    await waitFor(() => expect(screen.queryByTestId('confirm-action-submit')).not.toBeInTheDocument());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(revokePlatformOperator).toHaveBeenCalledTimes(2);
  });

  it('retirer un opérateur, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(revokePlatformOperator).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await retirerOperateur();

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(revokePlatformOperator).toHaveBeenCalledTimes(1);
  });

  it('relancer une invitation : la garde s’ouvre, puis la relance est rejouée', async () => {
    vi.mocked(resendSuperAdminInvitation)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce(LISTING.pending_invitations[0]);
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await userEvent.setup().click(within(await screen.findByTestId('invitation-7')).getByRole('button', { name: /Relancer/ }));

    await waitFor(() => expect(resendSuperAdminInvitation).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(await screen.findByText('Invitation relancée pour coopte@takussan.app.')).toBeInTheDocument();
  });

  it('relancer une invitation, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(resendSuperAdminInvitation).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await userEvent.setup().click(within(await screen.findByTestId('invitation-7')).getByRole('button', { name: /Relancer/ }));

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(resendSuperAdminInvitation).toHaveBeenCalledTimes(1);
  });

  it('annuler une invitation : la garde s’ouvre, puis l’annulation est rejouée', async () => {
    vi.mocked(revokeSuperAdminInvitation)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ ...LISTING.pending_invitations[0], status: 'revoked' });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);
    const user = userEvent.setup();

    await user.click(within(await screen.findByTestId('invitation-7')).getByRole('button', { name: ANNULER }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: ANNULER }));

    await waitFor(() => expect(revokeSuperAdminInvitation).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(await screen.findByText('Invitation annulée pour coopte@takussan.app.')).toBeInTheDocument();
  });
});
