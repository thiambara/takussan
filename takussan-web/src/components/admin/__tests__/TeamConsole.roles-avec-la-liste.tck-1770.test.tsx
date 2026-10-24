/**
 * TCK-1770 (P136.04) — la colonne « Rôle » de l'écran Équipe vient avec la liste des membres.
 *
 * Mesuré le 2026-10-23 : la console lisait la page de membres, puis, sa réponse reçue, demandait
 * `GET /api/agencies/{id}/role-assignments` pour les identifiants de cette page — deux
 * allers-retours en série à chaque page ou filtre. Décision du porteur : les affectations de rôle,
 * bornées à la page, viennent dans la liste des membres ; un seul appel suffit.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { TeamConsole } from '../TeamConsole';

const AGENCE = 12;

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

const api = vi.hoisted(() => ({ requete: vi.fn((_url: string) => Promise.resolve({})) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: api.requete,
}));

describe('<TeamConsole> — les rôles viennent avec la liste (TCK-1770)', () => {
  it('un seul appel suffit : la liste demande les affectations, et rien ne les redemande', async () => {
    const reseau = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
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
          },
        ],
        meta: {
          current_page: 1,
          last_page: 1,
          per_page: 20,
          total: 1,
          role_assignments: [
            { profile_id: 9, profile_type: 'agent', user_id: 3, agency_role_id: 4, agency_role_name: 'Agent senior' },
          ],
        },
      }),
    }));
    vi.stubGlobal('fetch', reseau);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <TeamConsole agencyId={AGENCE} currentUserId={1} primaryAdminId={2} />
        </QueryClientProvider>,
      ),
    );

    const rangee = await screen.findByTestId('admin-user-row-3');
    expect(await within(rangee).findByText('Agent senior')).toBeInTheDocument();

    const urls = [...reseau.mock.calls.map((c) => String(c[0])), ...api.requete.mock.calls.map((c) => String(c[0]))];
    expect(urls.filter((u) => u.includes('/api/admin-users'))).toHaveLength(1);
    expect(urls.find((u) => u.includes('/api/admin-users'))).toContain('with_role_assignments=1');
    expect(urls.some((u) => u.includes('role-assignments'))).toBe(false);
    vi.unstubAllGlobals();
  });
});
