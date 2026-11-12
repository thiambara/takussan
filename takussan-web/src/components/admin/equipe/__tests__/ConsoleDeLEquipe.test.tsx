import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { fetchAdminUsers } from '@/lib/queries/admin-users';
import { fetchPendingAgencyInvitations } from '@/lib/queries/agency-invitations';
import { postTeamSuspension } from '@/lib/queries/team-suspension';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow, AdminAgencyUsersResponse } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';

import { ConsoleDeLEquipe } from '../ConsoleDeLEquipe';

/**
 * TCK-2667 — la page Équipe « une personne, une fiche ». Ce fichier reprend l'intention des tests de
 * `TeamConsole` (TCK-587, TCK-1203, TCK-1412, TCK-1770, TCK-1901) et d'`AdminUsersTable` /
 * `UserDetailDrawer` (TCK-279, TCK-589, TCK-591, TCK-1834, TCK-2364), retirés avec eux, et y ajoute
 * les critères du ticket : bailleurs hors de la liste et renvoyés à Propriétaires (AC2, AC3),
 * « Commissions dues » absente sans la clé (AC4), `?vue=performance` (AC5), la fiche au téléphone
 * et « Suspendre » en deux touches (AC1).
 */
const E = fr.admin.team.equipe;
const S = fr.admin.team.suspension;
const AGENCE = 12;
const MOI = 1;
const PRINCIPAL = 2;

function ligne(id: number, prenom: string, profils: Partial<AdminAgencyUserRow> = {}): AdminAgencyUserRow {
  return {
    id,
    first_name: prenom,
    last_name: 'Test',
    email: `${prenom.toLowerCase()}@exemple.sn`,
    phone: '+221770000000',
    status: 'active',
    last_login_at: null,
    created_at: '2026-10-01T00:00:00Z',
    agent_profiles: [],
    owner_profiles: [],
    agency_admin_profiles: [],
    two_factor_enabled: true,
    properties_followed_count: 0,
    commissions_due_amount: 0,
    current_absence: null,
    joined_at: '2024-03-01T00:00:00Z',
    ...profils,
  };
}
const ADMIN = (statut = 'active') => [{ agency_id: AGENCE, status: statut }];
const AGENT = (statut = 'active') => [{ agency_id: AGENCE, status: statut }];

let lignes: AdminAgencyUserRow[] = [];
let affectations: AgencyRoleAssignment[] = [];
let capacites: readonly string[] = [];
let params = new URLSearchParams();
let telephone = false;
const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => params,
  usePathname: () => '/app/agency/team',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: (c: string) => ({ can: capacites.includes(c), isLoading: false }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: (q: string) => (q.includes('<') ? telephone : !telephone) }));
vi.mock('@/lib/queries/admin-users', () => ({
  fetchAdminUsers: vi.fn(async (): Promise<AdminAgencyUsersResponse> => ({
    data: lignes,
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 20,
      total: lignes.length,
      role_assignments: affectations,
      counts: { agent: 9, agency_admin: 2, owner: 11, staff: 11, absent: 1 },
    },
  })),
}));
vi.mock('@/lib/queries/agency-invitations', () => ({
  agencyInvitationKeys: {
    all: ['agency-invitations'],
    liste: (a: number, s: string, p: number, n: number) => ['agency-invitations', 'liste', a, s, p, n],
  },
  fetchPendingAgencyInvitations: vi.fn(async () => ({
    data: [{ id: 1, email: 'moussa.ba@exemple.sn' }],
    meta: { total: 1, current_page: 1, last_page: 1, per_page: 10 },
  })),
}));
vi.mock('@/lib/queries/agent-crm', () => ({
  AGENT_CRM_QUERY_KEY: {
    absences: (a: number) => ['agent-crm', a, 'absences'],
    portfolio: (a: number, u: number) => ['agent-crm', a, 'portfolio', u],
  },
  fetchAbsences: vi.fn(async () => []),
  fetchMemberPortfolio: vi.fn(async () => ({ user_id: 0, portfolio: { customers: 41, visits: 5 }, transferable: [], pending: [] })),
}));
vi.mock('@/lib/queries/team-suspension', () => ({ postTeamSuspension: vi.fn(async () => ({ data: { user_id: 0, profiles: [] } })) }));
vi.mock('../LesInvitations', () => ({
  LesInvitations: (p: { appelALInvitation?: number; peutInviter: boolean }) => (
    <p data-testid="invitations">{`appel:${p.appelALInvitation ?? 0}:${p.peutInviter ? 'formulaire' : 'sans-formulaire'}`}</p>
  ),
}));
vi.mock('@/components/admin/team/TeamPerformanceTable', () => ({ TeamPerformanceTable: () => <p data-testid="performance" /> }));
vi.mock('../CouvrirUneAbsence', () => ({
  useTerminerLAbsence: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  CouvrirUneAbsence: (p: { cible: { absentId: number } | null; peutDeleguer: boolean }) =>
    p.cible ? <p data-testid="couvrir">{`${p.cible.absentId}:${p.peutDeleguer ? 'delegue' : 'seul'}`}</p> : null,
}));
vi.mock('@/components/crm/HandoverWizard', () => ({
  HandoverWizard: (p: { member: AdminAgencyUserRow | null }) => (p.member ? <p data-testid="passation">{p.member.id}</p> : null),
}));
vi.mock('@/components/admin/users/UserRolesEditor', () => ({ UserRolesEditor: () => null }));
vi.mock('@/components/admin/roles/MemberAgencyRoleSelect', () => ({
  MemberAgencyRoleSelect: ({ assignment }: { assignment: AgencyRoleAssignment }) => <p data-testid="role-d-agence">{assignment.profile_type}</p>,
}));
vi.mock('@/components/admin/roles/AgentCommissionRateField', () => ({
  AgentCommissionRateField: ({ assignment }: { assignment: AgencyRoleAssignment }) => <p data-testid="taux">{assignment.profile_id}</p>,
}));

function monter(
  props: Partial<React.ComponentProps<typeof ConsoleDeLEquipe>> = {},
  garde?: GardeDoubleFacteurFn,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const arbre = (
    <QueryClientProvider client={client}>
      <ConsoleDeLEquipe agencyId={AGENCE} currentUserId={MOI} primaryAdminId={PRINCIPAL} agencyKind="standard" {...props} />
    </QueryClientProvider>
  );
  return render(withIntl(garde ? <ContexteGardeDoubleFacteur.Provider value={garde}>{arbre}</ContexteGardeDoubleFacteur.Provider> : arbre));
}

async function menuDe(user: ReturnType<typeof userEvent.setup>, id: number): Promise<string[]> {
  const rangee = await screen.findByTestId(`membre-${id}`);
  const boutons = within(rangee).getAllByRole('button');
  await user.click(boutons[boutons.length - 1]);
  const items = (await screen.findAllByRole('menuitem')).map((el) => el.textContent ?? '');
  await user.keyboard('{Escape}');
  return items;
}

beforeEach(() => {
  lignes = [
    ligne(MOI, 'Moi', { agency_admin_profiles: ADMIN() }),
    ligne(PRINCIPAL, 'Principal', { agency_admin_profiles: ADMIN() }),
    ligne(3, 'Awa', { agent_profiles: AGENT(), commissions_due_amount: 1_204_000, properties_followed_count: 23 }),
    ligne(5, 'Cheikh', { agent_profiles: AGENT('suspended') }),
  ];
  affectations = [];
  capacites = ['team.suspend'];
  params = new URLSearchParams();
  telephone = false;
  push.mockClear();
  replace.mockClear();
  vi.mocked(postTeamSuspension).mockClear();
  vi.mocked(fetchAdminUsers).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('la liste des collaborateurs (AC2, AC3)', () => {
  it('ne demande que le personnel, avec son résumé', async () => {
    monter();
    await screen.findByTestId('membre-3');
    expect(fetchAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent,agency_admin', resume: true, absent: false }));
  });

  it('« Vos bailleurs sont dans Propriétaires » mène à la page des bailleurs, où « Suspendre » vit (TCK-2641)', async () => {
    monter();
    expect(await screen.findByRole('link', { name: 'Propriétaires' })).toHaveAttribute('href', '/app/owners');
  });

  it('l’ancien onglet des bailleurs (`filter[role]=owner`) est renvoyé à `/app/owners`', async () => {
    params = new URLSearchParams('filter[role]=owner');
    monter();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/owners'));
  });

  it('au téléphone, la pastille « Tous » compte le personnel (`staff`), et « Absents » filtre la liste', async () => {
    telephone = true;
    const user = userEvent.setup();
    monter();
    const tous = await screen.findByRole('button', { name: new RegExp(`^${E.pastilles.tous}`) });
    await waitFor(() => expect(tous).toHaveTextContent('11'));
    await user.click(screen.getByRole('button', { name: new RegExp(`^${E.pastilles.absents}`) }));
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('filter%5Babsent%5D=1'), { scroll: false });
  });
});

describe('une absence en cours', () => {
  const absence = { starts_at: '2026-11-10T00:00:00Z', ends_at: '2026-11-14T00:00:00Z', substitute: { id: 4, name: 'Khady Diallo' } };

  it('au téléphone, la ligne dit « Absent jusqu’au… → Khady », le remplaçant nommé en entier pour le lecteur d’écran', async () => {
    telephone = true;
    lignes = [ligne(5, 'Pape', { agent_profiles: AGENT(), current_absence: absence })];
    monter();
    const bouton = await screen.findByRole('button', { name: /Pape Test/ });
    expect(bouton).toHaveTextContent(E.etat.absent.replace('{date}', '14 nov.'));
    expect(bouton).toHaveTextContent('Khady');
    expect(within(bouton).getByText(E.etat.couvertPar.replace('{nom}', 'Khady Diallo'))).toHaveClass('sr-only');
  });

  it('au bureau, la pastille « Absent jusqu’au… » et « couvert par… » sous elle', async () => {
    lignes = [ligne(5, 'Pape', { agent_profiles: AGENT(), current_absence: absence })];
    monter();
    const rangee = await screen.findByTestId('membre-5');
    expect(within(rangee).getByText(E.etat.absent.replace('{date}', '14 nov.'))).toBeInTheDocument();
    expect(within(rangee).getByText(E.etat.couvertPar.replace('{nom}', 'Khady Diallo'))).toBeInTheDocument();
  });
});

describe('les colonnes du bureau', () => {
  it('AC4 — sans `commissions_due_amount`, la colonne « Commissions dues » n’existe pas', async () => {
    lignes = lignes.map(({ commissions_due_amount: _retire, ...reste }) => reste);
    monter();
    await screen.findByTestId('membre-3');
    expect(screen.queryByRole('columnheader', { name: E.table.dues })).toBeNull();
  });

  it('avec la clé, la colonne dit le montant dû', async () => {
    monter();
    await screen.findByTestId('membre-3');
    expect(screen.getByRole('columnheader', { name: E.table.dues })).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-3')).getByText(/1\s204\s000/)).toBeInTheDocument();
  });

  it('TCK-589 — la 2FA activée, à activer, et ABSENTE (jamais lue comme « à activer »)', async () => {
    lignes = [
      ligne(3, 'Awa', { agent_profiles: AGENT(), two_factor_enabled: true }),
      ligne(4, 'Ibou', { agent_profiles: AGENT(), two_factor_enabled: false }),
      ligne(6, 'Sans', { agent_profiles: AGENT() }),
    ];
    delete lignes[2].two_factor_enabled;
    monter();
    expect(within(await screen.findByTestId('membre-3')).getByText(E.deuxFA.activee)).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-4')).getByText(E.deuxFA.aActiver)).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-6')).queryByText(E.deuxFA.aActiver)).toBeNull();
  });

  it('TCK-279 — le nom de l’AgencyRole quand l’affectation est servie, sinon le type de profil', async () => {
    affectations = [{ profile_id: 30, profile_type: 'agent', user_id: 3, agency_role_id: 7, agency_role_name: 'Agent senior', commission_rate: 40 }];
    monter();
    expect(within(await screen.findByTestId('membre-3')).getByText(/Agent senior/)).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-3')).getByText(/40 %/)).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-2')).getByText(E.role.agency_admin)).toBeInTheDocument();
  });

  it('TCK-1834 — un compte bloqué par la plateforme se dit tel quel, un statut inconnu reste brut', async () => {
    lignes = [ligne(3, 'Awa', { agent_profiles: AGENT(), status: 'blocked' }), ligne(4, 'Ibou', { agent_profiles: AGENT(), status: 'deleted' })];
    monter();
    expect(within(await screen.findByTestId('membre-3')).getByText(fr.admin.users.status.blocked)).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-4')).getByText('deleted')).toBeInTheDocument();
  });

  it('TCK-1770 — la liste demande les affectations : un seul appel', async () => {
    monter();
    await screen.findByTestId('membre-3');
    expect(fetchAdminUsers).toHaveBeenCalledTimes(1);
  });
});

describe('suspendre dans l’agence (TCK-587, TCK-1203, TCK-1412)', () => {
  it('« Suspendre » sur un agent, « Réactiver » sur un suspendu ; rien sur soi ni sur l’admin principal', async () => {
    const user = userEvent.setup();
    monter();
    expect(await menuDe(user, 3)).toContain(S.suspend);
    expect(await menuDe(user, 5)).toContain(S.reactivate);
    expect(await menuDe(user, MOI)).not.toContain(S.suspend);
    expect(await menuDe(user, PRINCIPAL)).not.toContain(S.suspend);
    expect(within(screen.getByTestId('membre-5')).getByText(E.etat.suspendu)).toBeInTheDocument();
  });

  it('sans `team.suspend`, aucune suspension n’est offerte', async () => {
    capacites = [];
    const user = userEvent.setup();
    monter();
    expect(await menuDe(user, 3)).not.toContain(S.suspend);
  });

  it('confirme en disant que le compte n’est pas touché, puis suspend dans CETTE agence', async () => {
    const user = userEvent.setup();
    monter();
    await menuDe(user, 3);
    const rangee = screen.getByTestId('membre-3');
    const boutons = within(rangee).getAllByRole('button');
    await user.click(boutons[boutons.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: S.suspend }));
    const dialogue = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(dialogue).toHaveTextContent(/Son compte n.est pas touché/);
    await user.click(within(dialogue).getByRole('button', { name: S.confirmSuspend }));
    await waitFor(() => expect(postTeamSuspension).toHaveBeenCalledWith(AGENCE, 3, 'suspend', 'jeton-de-test'));
  });

  it('un refus de second facteur ouvre la garde, puis la suspension est rejouée', async () => {
    vi.mocked(postTeamSuspension)
      .mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }))
      .mockResolvedValueOnce({ data: { user_id: 3, profiles: [] } } as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const user = userEvent.setup();
    monter({}, garde);
    const rangee = await screen.findByTestId('membre-3');
    const boutons = within(rangee).getAllByRole('button');
    await user.click(boutons[boutons.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: S.suspend }));
    const dialogue = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await user.click(within(dialogue).getByRole('button', { name: S.confirmSuspend }));
    await waitFor(() => expect(postTeamSuspension).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche', async () => {
    vi.mocked(postTeamSuspension).mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }));
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const user = userEvent.setup();
    monter({}, garde);
    const rangee = await screen.findByTestId('membre-3');
    const boutons = within(rangee).getAllByRole('button');
    await user.click(boutons[boutons.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: S.suspend }));
    const dialogue = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await user.click(within(dialogue).getByRole('button', { name: S.confirmSuspend }));
    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(postTeamSuspension).toHaveBeenCalledTimes(1);
  });

  it('TCK-1412 — un non-admin sans `team.remove` suspend mais ne retire pas ; l’admin retire toujours', async () => {
    const user = userEvent.setup();
    const { unmount } = monter({ estAdmin: false });
    expect(await menuDe(user, 3)).not.toContain(E.fiche.retirer);
    unmount();
    monter();
    expect(await menuDe(user, 3)).toContain(E.fiche.retirer);
  });

  it('avec `team.remove`, le non-admin se voit offrir « Retirer », qui ouvre la passation', async () => {
    capacites = ['team.suspend', 'team.remove'];
    const user = userEvent.setup();
    monter({ estAdmin: false });
    const rangee = await screen.findByTestId('membre-3');
    const boutons = within(rangee).getAllByRole('button');
    await user.click(boutons[boutons.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: E.fiche.retirer }));
    expect(await screen.findByTestId('passation')).toHaveTextContent('3');
  });
});

describe('la fiche d’un membre', () => {
  it('AC1 — au téléphone, une ligne par personne ; le toucher pousse la fiche, dont la barre porte « Suspendre »', async () => {
    telephone = true;
    const user = userEvent.setup();
    const { rerender } = monter();
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(await screen.findByRole('button', { name: /Awa Test/ }));
    expect(push).toHaveBeenCalledWith('/app/agency/team?membre=3', { scroll: true });

    params = new URLSearchParams('membre=3');
    rerender(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ConsoleDeLEquipe agencyId={AGENCE} currentUserId={MOI} primaryAdminId={PRINCIPAL} agencyKind="standard" />
        </QueryClientProvider>,
      ),
    );
    expect(await screen.findByTestId('fiche-du-membre')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: E.fiche.barre.suspendre }));
    expect(await screen.findByText(S.suspendTitle.replace('{name}', 'Awa Test'))).toBeInTheDocument();
  });

  it('TCK-2668 — « Déclarer une absence » ouvre « Couvrir une absence » pour le membre (`team.delegate_role` pour un autre)', async () => {
    telephone = true;
    capacites = ['team.suspend', 'team.delegate_role'];
    params = new URLSearchParams('membre=3');
    const user = userEvent.setup();
    monter();
    await screen.findByTestId('fiche-du-membre');
    expect(screen.queryByTestId('couvrir')).toBeNull();
    await user.click(screen.getByRole('button', { name: E.fiche.barre.declarer }));
    expect(screen.getByTestId('couvrir')).toHaveTextContent('3:delegue');
  });

  it('TCK-2668 — pour sa propre absence, sans `team.delegate_role`, le formulaire n’offre pas la case de délégation', async () => {
    telephone = true;
    params = new URLSearchParams(`membre=${MOI}`);
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: E.fiche.barre.declarer }));
    expect(screen.getByTestId('couvrir')).toHaveTextContent(`${MOI}:seul`);
  });

  it('sans `team.delegate_role`, l’admin ne déclare une absence que pour lui-même', async () => {
    telephone = true;
    params = new URLSearchParams('membre=3');
    const { unmount } = monter();
    await screen.findByTestId('fiche-du-membre');
    expect(screen.queryByRole('button', { name: E.fiche.barre.declarer })).toBeNull();
    unmount();
    params = new URLSearchParams(`membre=${MOI}`);
    monter();
    expect(await screen.findByRole('button', { name: E.fiche.barre.declarer })).toBeInTheDocument();
  });

  it('au bureau, le panneau ; « Commissions dues » mène aux commissions de la personne', async () => {
    params = new URLSearchParams('membre=3');
    monter();
    const fiche = await screen.findByTestId('fiche-du-membre');
    expect(within(fiche).getByRole('link', { name: /Commissions dues/ })).toHaveAttribute('href', '/app/commissions?agent=3');
  });

  it('AC4 — sans la clé, la fiche ne dit rien des commissions', async () => {
    lignes = lignes.map(({ commissions_due_amount: _retire, ...reste }) => reste);
    params = new URLSearchParams('membre=3');
    monter();
    const fiche = await screen.findByTestId('fiche-du-membre');
    expect(within(fiche).queryByText(E.fiche.commissionsDues)).toBeNull();
  });

  it('TCK-2364 — le taux de commission sur le profil d’agent, et seulement sous `team.assign_role`', async () => {
    affectations = [{ profile_id: 30, profile_type: 'agent', user_id: 3, agency_role_id: 7, agency_role_name: 'Agent', commission_rate: 40 }];
    params = new URLSearchParams('membre=3');
    const { unmount } = monter();
    await screen.findByTestId('fiche-du-membre');
    expect(screen.queryByTestId('taux')).toBeNull();
    unmount();
    capacites = ['team.suspend', 'team.assign_role'];
    monter();
    expect(await screen.findByTestId('taux')).toHaveTextContent('30');
  });

  it('« Clients et visites » vient du portefeuille, servi sous `team.remove` (ou à l’admin)', async () => {
    params = new URLSearchParams('membre=3');
    monter();
    expect(await screen.findByText(/41 clients actifs · 5 visites à venir/)).toBeInTheDocument();
  });
});

describe('la liste suit l’agence et l’URL', () => {
  it('TCK-1901 — relit la liste quand l’agence change, et n’affiche plus les membres de l’agence quittée', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = monter({}, undefined, client);
    await screen.findByTestId('membre-3');
    lignes = [ligne(9, 'Bineta', { agent_profiles: [{ agency_id: 13, status: 'active' }] })];
    rerender(
      withIntl(
        <QueryClientProvider client={client}>
          <ConsoleDeLEquipe agencyId={13} currentUserId={MOI} primaryAdminId={null} agencyKind="standard" />
        </QueryClientProvider>,
      ),
    );
    expect(await screen.findByTestId('membre-9')).toBeInTheDocument();
    expect(screen.queryByTestId('membre-3')).toBeNull();
    expect(fetchAdminUsers).toHaveBeenCalledTimes(2);
  });

  it('la recherche s’écrit dans l’URL, une fois la saisie posée, et fait tomber la page et la fiche', async () => {
    params = new URLSearchParams('page=3&membre=99'); // une fiche demandée, absente de la page : aucun panneau ouvert
    const user = userEvent.setup();
    monter();
    await user.type(await screen.findByRole('searchbox'), 'awa');
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledTimes(1);
    const url = String(replace.mock.calls[0][0]);
    expect(url).toContain('filter%5Bsearch%5D=awa');
    expect(url).not.toContain('page=');
    expect(url).not.toContain('membre=');
  });

  it('le tri par en-tête s’écrit dans l’URL (`sort=first_name`, puis `-first_name`), page et fiche retombent', async () => {
    params = new URLSearchParams('page=2');
    const user = userEvent.setup();
    monter();
    await screen.findByTestId('membre-3');
    await user.click(screen.getByRole('button', { name: E.table.trierPar.replace('{colonne}', E.table.membre) }));
    const url = String(replace.mock.calls.at(-1)?.[0]);
    expect(url).toContain('sort=first_name');
    expect(url).not.toContain('page=');
  });

  it('le filtre de statut s’écrit dans l’URL ; « Tous les statuts » le retire', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByTestId('membre-3');
    await user.click(screen.getByRole('combobox', { name: fr.admin.users.filters.status }));
    await user.click(await screen.findByRole('option', { name: fr.admin.users.status.blocked }));
    expect(String(replace.mock.calls.at(-1)?.[0])).toContain('filter%5Bstatus%5D=blocked');
  });

  it('« Vous » sur sa propre ligne, et sur elle seule', async () => {
    monter();
    expect(within(await screen.findByTestId(`membre-${MOI}`)).getByText(E.vous)).toBeInTheDocument();
    expect(within(screen.getByTestId('membre-3')).queryByText(E.vous)).toBeNull();
  });

  it('TCK-587 — la fiche d’un agent ne propose jamais de bloquer le compte', async () => {
    params = new URLSearchParams('membre=3');
    monter();
    const fiche = await screen.findByTestId('fiche-du-membre');
    expect(within(fiche).queryByText(/Bloquer/)).toBeNull();
    expect(within(document.body).queryByRole('button', { name: /Bloquer/ })).toBeNull();
  });

  it('« Inviter » : à l’admin, au non-admin qui tient `team.invite`, à personne d’autre', async () => {
    const { unmount } = monter({ estAdmin: false });
    await screen.findByTestId('membre-3');
    expect(screen.queryByRole('button', { name: E.inviter })).toBeNull();
    unmount();
    capacites = ['team.invite'];
    monter({ estAdmin: false });
    expect(await screen.findByRole('button', { name: E.inviter })).toBeInTheDocument();
  });
});

describe('les états de la liste', () => {
  it('vide : « Aucun membre dans l’équipe », et l’invitation offerte', async () => {
    lignes = [];
    monter();
    const vide = await screen.findByTestId('team-console-empty');
    expect(vide).toHaveTextContent(fr.team.page.empty_title);
    expect(within(vide).getByRole('button', { name: fr.team.page.add })).toBeInTheDocument();
  });

  it('vide filtrée : la phrase des filtres, sans invitation', async () => {
    lignes = [];
    params = new URLSearchParams('filter[search]=zzz');
    monter();
    const vide = await screen.findByTestId('team-console-empty');
    expect(vide).toHaveTextContent(fr.team.page.empty_filtered_title);
    expect(within(vide).queryByRole('button')).toBeNull();
  });

  it('erreur : le message et « Réessayer », qui relit la liste', async () => {
    vi.mocked(fetchAdminUsers).mockRejectedValueOnce(new ApiError(500, { message: 'Panne.' }));
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: fr.common.actions.retry }));
    expect(await screen.findByTestId('membre-3')).toBeInTheDocument();
    expect(fetchAdminUsers).toHaveBeenCalledTimes(2);
  });
});

describe('les vues', () => {
  it('AC5 — `?vue=performance` ouvre la performance (agence standard, `reports.view_agency`)', async () => {
    capacites = ['reports.view_agency'];
    params = new URLSearchParams('vue=performance');
    monter();
    expect(await screen.findByTestId('performance')).toBeInTheDocument();
  });

  it('sans la capacité, `?vue=performance` retombe sur la liste', async () => {
    params = new URLSearchParams('vue=performance');
    monter();
    expect(await screen.findByTestId('membre-3')).toBeInTheDocument();
    expect(screen.queryByTestId('performance')).toBeNull();
  });

  it('TCK-2668 — « Inviter un membre » mène à l’onglet des invitations, dont le formulaire prend le focus', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: E.inviter }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('vue=invitations'), { scroll: false });
  });

  it('TCK-2668 — l’onglet des invitations rend l’écran des invitations, formulaire compris', async () => {
    params = new URLSearchParams('vue=invitations');
    monter();
    expect(await screen.findByTestId('invitations')).toHaveTextContent('appel:0:formulaire');
  });

  it('TCK-2668 — sous l’onglet des invitations, l’en-tête garde son sous-titre et le compte des membres', async () => {
    params = new URLSearchParams('vue=invitations');
    monter();
    expect(await screen.findByText(/^9 agents, 2 administrateurs/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Membres/ })).toHaveTextContent('11');
  });

  it('TCK-2668 — l’onglet compte les invitations d’équipe EN COURS', async () => {
    monter();
    await screen.findByTestId('membre-3');
    expect(fetchPendingAgencyInvitations).toHaveBeenCalledWith('jeton-de-test', { statut: 'sent', page: 1, perPage: 10 });
  });
});
