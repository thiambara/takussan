/**
 * TCK-595 (AD16, § Direction UX) — l'onglet « Performance » de `/admin/team`.
 *
 * Il n'est offert qu'aux agences `standard` et à qui détient `reports.view_agency` (la garde de
 * l'API) ; il remplace alors la liste des membres par une ligne par agent, triable par colonne.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { TeamConsole } from '@/components/admin/TeamConsole';
import { TeamPerformanceTable } from '../TeamPerformanceTable';

const etat = vi.hoisted(() => ({ capacites: [] as string[], recherche: '' }));

vi.mock('@/components/admin/PendingInvitationsSection', () => ({ PendingInvitationsSection: () => null }));
vi.mock('@/components/crm/AgentAbsencesSection', () => ({ AgentAbsencesSection: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(etat.recherche),
  usePathname: () => '/admin/team',
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, agency_id: 5 }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({
  useCan: (capacite: string) => ({ can: etat.capacites.includes(capacite), isLoading: false }),
}));
vi.mock('@/lib/queries/agency-roles', () => ({
  useAgencyRoleAssignments: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  agencyRoleKeys: { assignments: () => ['agency-roles', 'assignments'] },
}));
vi.mock('@/lib/queries/admin-users', () => ({
  fetchAdminUsers: () => Promise.resolve({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }),
}));

const AGENTS = [
  { user_id: 10, name: 'Awa Diop', leases_signed: 2, sales_signed: 0, visits_completed: 3, customers_added: 1, commissions_earned: 90000, properties_managed: 4, tasks_overdue: 0 },
  { user_id: 11, name: 'Bara Sy', leases_signed: 0, sales_signed: 0, visits_completed: 5, customers_added: 0, commissions_earned: 0, properties_managed: 1, tasks_overdue: 2 },
];

function mockFetch() {
  const spy = vi.fn(async () => {
    const corps = { data: { period: '2026-07', agents: AGENTS } };
    return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function monter(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

const nomsDansLOrdre = () =>
  screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent);

beforeEach(() => {
  etat.capacites = [];
  etat.recherche = '';
  vi.unstubAllGlobals();
});

describe('TeamPerformanceTable', () => {
  it('lit la performance du mois de l’agence et rend une ligne par agent', async () => {
    const spy = mockFetch();
    monter(<TeamPerformanceTable agencyId={5} />);

    await screen.findByText('Awa Diop');
    const url = String((spy.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/\/api\/agencies\/5\/team-performance\?period=\d{4}-\d{2}$/);
    const ligne = screen.getByText('Awa Diop').closest('tr')!;
    expect(within(ligne).getAllByRole('cell').map((c) => c.textContent)).toContain('90 000 F CFA');
  });

  it('trie par colonne : par défaut les commissions, puis les visites', async () => {
    mockFetch();
    monter(<TeamPerformanceTable agencyId={5} />);

    await screen.findByText('Awa Diop');
    expect(nomsDansLOrdre()).toEqual(['Awa Diop', 'Bara Sy']);

    // Premier clic : décroissant (la forme `-cle` de `DataTable`), second : croissant.
    fireEvent.click(screen.getByRole('button', { name: 'Trier par Visites effectuées' }));
    await waitFor(() => expect(nomsDansLOrdre()).toEqual(['Bara Sy', 'Awa Diop']));
    fireEvent.click(screen.getByRole('button', { name: 'Trier par Visites effectuées' }));
    await waitFor(() => expect(nomsDansLOrdre()).toEqual(['Awa Diop', 'Bara Sy']));
  });
});

describe('TeamConsole — l’onglet Performance', () => {
  it('absent sans reports.view_agency, même si l’URL le demande', async () => {
    etat.recherche = 'vue=performance';
    mockFetch();
    monter(<TeamConsole agencyId={5} currentUserId={1} agencyKind="standard" />);

    expect(screen.queryByRole('tab', { name: 'Performance' })).toBeNull();
    expect(screen.queryByText("Performance de l'équipe")).toBeNull();
  });

  it('absent pour une agence individual', () => {
    etat.capacites = ['reports.view_agency'];
    mockFetch();
    monter(<TeamConsole agencyId={5} currentUserId={1} agencyKind="individual" />);

    expect(screen.queryByRole('tab', { name: 'Performance' })).toBeNull();
  });

  it('offert et rendu pour l’admin d’une agence standard', async () => {
    etat.capacites = ['reports.view_agency'];
    etat.recherche = 'vue=performance';
    mockFetch();
    monter(<TeamConsole agencyId={5} currentUserId={1} agencyKind="standard" />);

    expect(screen.getByRole('tab', { name: 'Performance' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Awa Diop')).toBeInTheDocument();
  });
});
