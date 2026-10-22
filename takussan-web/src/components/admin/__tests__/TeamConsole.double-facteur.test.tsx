import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { postTeamSuspension } from '@/lib/queries/team-suspension';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import { TeamConsole } from '../TeamConsole';

/**
 * TCK-1203 — suspendre un membre dans l'agence exige la 2FA de l'admin
 * (`TeamMemberSuspensionController`, `ProtectedActions::AGENCY_TWO_FACTOR`) : le refus passe par
 * la garde, puis la suspension est rejouée.
 */
const AGENCE = 12;
const AWA: AdminAgencyUserRow = {
  id: 3,
  first_name: 'Awa',
  last_name: 'Test',
  email: 'awa@exemple.sn',
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-10-01T00:00:00Z',
  agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
  owner_profiles: [],
  agency_admin_profiles: [],
};

vi.mock('@/components/admin/PendingInvitationsSection', () => ({ PendingInvitationsSection: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/agency/team',
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({
  useCan: (capability: string) => ({ can: capability === 'team.suspend', isLoading: false }),
}));
vi.mock('@/lib/queries/agency-roles', () => ({
  useAgencyRoleAssignments: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  agencyRoleKeys: { assignments: () => ['agency-roles', 'assignments'] },
}));
vi.mock('@/lib/queries/admin-users', () => ({
  fetchAdminUsers: () => Promise.resolve({
    data: [AWA],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
  }),
}));
vi.mock('@/lib/queries/agency-members', () => ({ removeAgencyMember: vi.fn() }));
vi.mock('@/lib/queries/team-suspension', () => ({ postTeamSuspension: vi.fn() }));

const T = fr.admin.team.suspension;
const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <TeamConsole agencyId={AGENCE} currentUserId={1} primaryAdminId={2} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

async function suspendreAwa() {
  const user = userEvent.setup();
  const rangee = await screen.findByTestId('admin-user-row-3');
  const declencheurs = within(rangee).getAllByRole('button');
  await user.click(declencheurs[declencheurs.length - 1]);
  await user.click(await screen.findByRole('menuitem', { name: T.suspend }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: T.confirmSuspend }));
}

describe('<TeamConsole> — suspension et second facteur', () => {
  beforeEach(() => {
    vi.mocked(postTeamSuspension).mockReset();
  });

  it('un refus de second facteur ouvre la garde, puis la suspension est rejouée', async () => {
    vi.mocked(postTeamSuspension)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ data: { user_id: 3, profiles: [] } } as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(garde);

    await suspendreAwa();

    await waitFor(() => expect(postTeamSuspension).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(postTeamSuspension).toHaveBeenLastCalledWith(AGENCE, 3, 'suspend', 'jeton-de-test');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Second facteur requis.')).not.toBeInTheDocument();
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche', async () => {
    vi.mocked(postTeamSuspension).mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    monter(garde);

    await suspendreAwa();

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledTimes(1);
    expect(postTeamSuspension).toHaveBeenCalledTimes(1);
  });
});
