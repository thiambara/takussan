import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { PendingInvitationsSection } from '../PendingInvitationsSection';

/**
 * TCK-1203 — relancer ou annuler une invitation exige la 2FA de l'agence
 * (`InvitationController@resend` / `@revoke`) : le refus passe par la garde, puis le geste est rejoué.
 */
const mockFetch = vi.fn();
const mockResend = vi.fn();
const mockRevoke = vi.fn();

vi.mock('@/lib/queries/agency-invitations', () => ({
  agencyInvitationKeys: {
    all: ['agency-invitations'] as const,
    pending: (agencyId: number, page: number) => ['agency-invitations', 'pending', agencyId, page] as const,
  },
  DEFAULT_PER_PAGE: 10,
  fetchPendingAgencyInvitations: (...args: unknown[]) => mockFetch(...args),
  resendInvitation: (...args: unknown[]) => mockResend(...args),
  revokeInvitation: (...args: unknown[]) => mockRevoke(...args),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

const INVITATION = {
  id: 7,
  email: 'fatou@exemple.sn',
  role: 'agent',
  status: 'sent' as const,
  agency_id: 12,
  invitable_type: 'App\\Models\\Profiles\\AgentProfile',
  invitable_id: 3,
  expires_at: '2026-09-02T10:00:00Z',
  created_at: '2026-08-26T10:00:00Z',
  is_expired: false,
};

function monter(garde: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <PendingInvitationsSection agencyId={12} agencyKind="standard" canManage />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

describe('<PendingInvitationsSection> — second facteur', () => {
  beforeEach(() => {
    for (const m of [mockFetch, mockResend, mockRevoke, toastAdd]) m.mockReset();
    mockFetch.mockResolvedValue({
      data: [INVITATION],
      meta: { current_page: 1, last_page: 1, per_page: 10, total: 1 },
    });
  });

  it('la relance refusée passe par la garde, puis est rejouée', async () => {
    mockResend.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: INVITATION });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(garde);

    await userEvent.click(await screen.findByRole('button', { name: /Relancer/ }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(mockResend).toHaveBeenCalledTimes(2);
    expect(mockResend).toHaveBeenLastCalledWith('jeton-de-test', 7);
  });

  it('l’annulation refusée passe par la garde, puis est rejouée', async () => {
    mockRevoke.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: INVITATION });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(garde);

    await userEvent.click(await screen.findByRole('button', { name: /Annuler/ }));
    await userEvent.click(await screen.findByRole('button', { name: "Annuler l'invitation" }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(mockRevoke).toHaveBeenCalledTimes(2);
  });

  it('garde abandonnée : pas de rejeu, l’échec est dit', async () => {
    mockResend.mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    monter(garde);

    await userEvent.click(await screen.findByRole('button', { name: /Relancer/ }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      description: 'Second facteur requis.',
    })));
    expect(garde).toHaveBeenCalledTimes(1);
    expect(mockResend).toHaveBeenCalledTimes(1);
  });
});
