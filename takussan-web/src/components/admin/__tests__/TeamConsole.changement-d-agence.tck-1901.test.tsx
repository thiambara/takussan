/**
 * TCK-1901 (P197.02) — la liste de l'équipe suit l'agence du profil actif.
 *
 * Le relais `/api/admin-users` pose l'indice du profil actif : la liste est celle de l'agence
 * active. Après un changement de profil, `router.refresh()` laisse la console montée et lui passe
 * la nouvelle `agencyId` ; une clé sans agence servait encore les membres de l'agence quittée.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { TeamConsole } from '../TeamConsole';

vi.mock('@/components/admin/PendingInvitationsSection', () => ({ PendingInvitationsSection: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/agency/team',
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

function membre(id: number, prenom: string, agence: number) {
  return {
    id,
    first_name: prenom,
    last_name: 'Test',
    email: `${prenom.toLowerCase()}@exemple.sn`,
    phone: null,
    status: 'active',
    last_login_at: null,
    created_at: '2026-10-01T00:00:00Z',
    agent_profiles: [{ agency_id: agence, status: 'active' }],
    owner_profiles: [],
    agency_admin_profiles: [],
  };
}

describe('<TeamConsole> — changement d’agence active (TCK-1901)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('relit la liste quand l’agence change, et n’affiche plus les membres de l’agence quittée', async () => {
    const reponses = [membre(3, 'Awa', 12), membre(4, 'Moussa', 13)];
    const reseau = vi.fn(async (_url: string) => {
      const ligne = reponses.shift() ?? membre(4, 'Moussa', 13);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [ligne],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, role_assignments: [] },
        }),
      };
    });
    vi.stubGlobal('fetch', reseau);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const arbre = (agence: number) =>
      withIntl(
        <QueryClientProvider client={client}>
          <TeamConsole agencyId={agence} currentUserId={1} primaryAdminId={2} />
        </QueryClientProvider>,
      );

    const { rerender } = render(arbre(12));
    expect(await screen.findByTestId('admin-user-row-3')).toBeInTheDocument();

    rerender(arbre(13));

    expect(await screen.findByTestId('admin-user-row-4')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-user-row-3')).not.toBeInTheDocument();
    const lectures = reseau.mock.calls.filter((c) => String(c[0]).includes('/api/admin-users'));
    expect(lectures).toHaveLength(2);
  });
});
