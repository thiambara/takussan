import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { postTeamSuspension } from '@/lib/queries/team-suspension';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import { TeamConsole } from '../TeamConsole';

/**
 * TCK-587 (ADR-0031 §2, AC14) — la console d'équipe suspend DANS l'agence, elle ne bloque plus
 * le compte.
 *
 * Avant ce ticket, chaque ligne proposait « Bloquer » (et le tiroir « Bloquer le compte ») :
 * `POST /users/{id}/block` coupait le membre de TOUTES ses agences, et l'API laissait faire un
 * admin d'agence. Ce geste est désormais réservé au super-admin ; la console propose
 * « Suspendre de l'agence » sur un agent ou un bailleur, jamais sur l'administrateur principal
 * (l'API le refuse en 422), ni sur soi-même.
 */
const AGENCE = 12;
const MOI = 1;
const PRINCIPAL = 2;

function ligne(
  id: number,
  prenom: string,
  profils: Partial<Pick<AdminAgencyUserRow, 'agent_profiles' | 'owner_profiles' | 'agency_admin_profiles'>>,
): AdminAgencyUserRow {
  return {
    id,
    first_name: prenom,
    last_name: 'Test',
    email: `${prenom.toLowerCase()}@exemple.sn`,
    phone: null,
    status: 'active',
    last_login_at: null,
    created_at: '2026-10-01T00:00:00Z',
    agent_profiles: [],
    owner_profiles: [],
    agency_admin_profiles: [],
    ...profils,
  };
}

const LIGNES: AdminAgencyUserRow[] = [
  ligne(MOI, 'Moi', { agency_admin_profiles: [{ agency_id: AGENCE, status: 'active' }] }),
  ligne(PRINCIPAL, 'Principal', { agency_admin_profiles: [{ agency_id: AGENCE, status: 'active' }] }),
  ligne(3, 'Awa', { agent_profiles: [{ agency_id: AGENCE, status: 'active' }] }),
  // Bailleur présent dans deux agences : son profil d'une AUTRE agence ne compte pas ici.
  ligne(4, 'Moussa', {
    owner_profiles: [
      { agency_id: AGENCE, status: 'active' },
      { agency_id: 99, status: 'blocked' },
    ],
  }),
  ligne(5, 'Fatou', { owner_profiles: [{ agency_id: AGENCE, status: 'blocked' }] }),
];

let capacites: readonly string[] = ['team.suspend'];

vi.mock('@/components/admin/PendingInvitationsSection', () => ({
  PendingInvitationsSection: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/team',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));

vi.mock('@/hooks/useCan', () => ({
  useCan: (capability: string) => ({ can: capacites.includes(capability), isLoading: false }),
}));

vi.mock('@/lib/queries/agency-roles', () => ({
  useAgencyRoleAssignments: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  agencyRoleKeys: { assignments: () => ['agency-roles', 'assignments'] },
}));

vi.mock('@/lib/queries/admin-users', () => ({
  fetchAdminUsers: () => Promise.resolve({
    data: LIGNES,
    meta: { current_page: 1, last_page: 1, per_page: 20, total: LIGNES.length },
  }),
}));

vi.mock('@/lib/queries/agency-members', () => ({
  removeAgencyMember: vi.fn(),
}));

vi.mock('@/lib/queries/team-suspension', () => ({
  postTeamSuspension: vi.fn(() => Promise.resolve({ data: { user_id: 0, profiles: [] } })),
}));

const T = fr.admin.team.suspension;
const ANCIENS = [fr.admin.users.table.block, fr.admin.users.drawer.blockAccount];

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <TeamConsole agencyId={AGENCE} currentUserId={MOI} primaryAdminId={PRINCIPAL} />
      </QueryClientProvider>,
    ),
  );
}

/** Ouvre le menu d'actions d'une ligne et rend les libellés de ses entrées. */
async function entreesDuMenu(user: ReturnType<typeof userEvent.setup>, id: number): Promise<string[]> {
  const rangee = await screen.findByTestId(`admin-user-row-${id}`);
  const declencheurs = within(rangee).getAllByRole('button');
  await user.click(declencheurs[declencheurs.length - 1]);
  const items = (await screen.findAllByRole('menuitem')).map((el) => el.textContent ?? '');
  await user.keyboard('{Escape}');
  return items;
}

describe('<TeamConsole> — suspendre de l’agence, jamais bloquer le compte (TCK-587, AC14)', () => {
  beforeEach(() => {
    capacites = ['team.suspend'];
    vi.mocked(postTeamSuspension).mockClear();
  });

  it('propose « Suspendre de l’agence » sur un agent et un bailleur, jamais le blocage du compte', async () => {
    const user = userEvent.setup();
    monter();

    for (const id of [3, 4]) {
      const items = await entreesDuMenu(user, id);
      expect(items).toContain(T.suspend);
      for (const ancien of ANCIENS) expect(items).not.toContain(ancien);
    }
  });

  it('ne propose rien sur l’administrateur principal ni sur soi-même', async () => {
    const user = userEvent.setup();
    monter();

    for (const id of [PRINCIPAL, MOI]) {
      const items = await entreesDuMenu(user, id);
      expect(items).not.toContain(T.suspend);
      expect(items).not.toContain(T.reactivate);
      for (const ancien of ANCIENS) expect(items).not.toContain(ancien);
    }
  });

  it('propose « Réactiver dans l’agence » sur un membre suspendu ici, et le signale', async () => {
    const user = userEvent.setup();
    monter();

    const rangee = await screen.findByTestId('admin-user-row-5');
    expect(within(rangee).getByText(T.suspendedBadge)).toBeInTheDocument();
    expect(within(await screen.findByTestId('admin-user-row-4')).queryByText(T.suspendedBadge))
      .not.toBeInTheDocument();
    expect(await entreesDuMenu(user, 5)).toContain(T.reactivate);
  });

  it('confirme en disant que le compte n’est pas touché, puis suspend dans CETTE agence', async () => {
    const user = userEvent.setup();
    monter();

    const rangee = await screen.findByTestId('admin-user-row-4');
    const declencheurs = within(rangee).getAllByRole('button');
    await user.click(declencheurs[declencheurs.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: T.suspend }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent("Son compte n'est pas touché");
    expect(postTeamSuspension).not.toHaveBeenCalled();

    await user.click(within(dialogue).getByRole('button', { name: T.confirmSuspend }));
    expect(postTeamSuspension).toHaveBeenCalledWith(AGENCE, 4, 'suspend', 'jeton-de-test');
  });

  it('le tiroir d’un agent ne propose plus « Bloquer le compte »', async () => {
    const user = userEvent.setup();
    monter();

    // Le premier bouton de la rangée est le nom du membre ; le dernier, son menu d'actions.
    await user.click(within(await screen.findByTestId('admin-user-row-3')).getAllByRole('button')[0]);
    const tiroir = await screen.findByRole('dialog');
    expect(within(tiroir).queryByRole('button', { name: fr.admin.users.drawer.blockAccount }))
      .not.toBeInTheDocument();
    expect(within(tiroir).getByTestId('team-suspension-button')).toHaveTextContent(T.suspend);
  });

  it('sans team.suspend, aucune suspension n’est proposée', async () => {
    capacites = [];
    const user = userEvent.setup();
    monter();

    const items = await entreesDuMenu(user, 3);
    expect(items).not.toContain(T.suspend);
  });
});
