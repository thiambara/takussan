/**
 * TCK-1766 (P136.03) — une seule lecture de `/api/me/welcome-seen` par chargement de la coque, et
 * le marqueur d'accueil de l'agence pris au layout, qui a déjà lu l'agence.
 *
 * Mesuré le 2026-10-23 : quatre lecteurs appelaient chacun `fetch('/api/me/welcome-seen')` dans
 * leur effet ; un client seul en faisait trois à chaque chargement de `/app`, et l'assistant de
 * l'agence relisait `GET /api/agencies/{id}` en entier pour son seul marqueur.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { AppShell } from '../AppShell';

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, token: 'jeton', isLoading: false, logout: vi.fn() }),
}));
vi.mock('../AppTopbar', () => ({ AppTopbar: () => null }));
vi.mock('../AppSidebar', () => ({ AppSidebar: () => null }));
vi.mock('@/components/announcements/BandeauxDuSite', () => ({ BandeauxDuSite: () => null }));
vi.mock('@/components/admin/super/ImpersonationBanner', () => ({ ImpersonationBanner: () => null }));
vi.mock('@/lib/queries/leases-active-summaries', () => ({
  useActiveLeaseSummaries: () => ({ data: { data: [{ id: 7, reference_number: 'B-7' }] } }),
}));

const client = { id: 1, first_name: 'Awa', last_name: 'Diop', email: 'a@x.test', roles: ['customer'] } as unknown as User;
const admin = {
  id: 2,
  first_name: 'Moussa',
  last_name: 'Fall',
  email: 'm@x.test',
  roles: ['agency_admin'],
  agency_id: 5,
} as unknown as User;

let reseau: ReturnType<typeof vi.fn>;
function stubVues(vues: string[]) {
  reseau = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init?.method === 'POST' ? {} : { data: vues }),
  }));
  vi.stubGlobal('fetch', reseau);
}
const lectures = (motif: string) =>
  reseau.mock.calls.filter(([url, init]) => String(url).includes(motif) && (init?.method ?? 'GET') === 'GET');

function rendre(user: User, props: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  auth.user = user;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AppShell user={user} {...props}>
          <p>contenu</p>
        </AppShell>
      </QueryClientProvider>,
    ),
  );
}

describe('AppShell — une lecture des accueils vus (TCK-1766)', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('client seul : parcours client, feuille de profil minimal et parcours locataire lisent une fois', async () => {
    stubVues(['customer-welcome']);
    rendre(client);

    await screen.findByText('Vos paiements');
    await new Promise((r) => setTimeout(r, 50));
    expect(lectures('/api/me/welcome-seen')).toHaveLength(1);
  });

  it('administrateur d’agence : le marqueur vient du layout, sans relire l’agence', async () => {
    stubVues([]);
    rendre(admin, {
      agencyIsStandard: true,
      agencyStandardWelcome: { agencyId: 5, unlockedAt: '2026-10-20T10:00:00Z' },
    });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(lectures('/api/agencies/')).toHaveLength(0);
    expect(lectures('/api/me/welcome-seen')).toHaveLength(1);
  });
});
