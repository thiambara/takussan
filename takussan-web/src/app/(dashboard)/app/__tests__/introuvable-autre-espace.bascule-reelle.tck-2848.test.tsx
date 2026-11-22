/**
 * TCK-2848 — la bascule de l'introuvable avec les VRAIS hooks (`useMyProfiles`, `useSwitchActiveProfile`)
 * sur un `fetch` doublé : la bascule est OPTIMISTE (`onMutate` écrit l'espace visé comme actif avant la
 * réponse). La carte « Basculer vers … » ne doit pas s'effacer au clic : elle reste, bouton inactif,
 * jusqu'au rechargement.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ContexteDuMenuDeLaCoque } from '@/components/layout/contexte-du-menu-de-la-coque';
import type { User } from '@/types/user';
import { AutreEspaceDeLIntrouvable } from '../AutreEspaceDeLIntrouvable';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/properties/48',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 41 }, token: 'jeton', refreshUser: vi.fn(), setActiveProfileId: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const PROFILS = {
  data: [
    { id: 'agent:3', type: 'agent', numeric_id: 3, agency_id: 1, agency: { id: 1, name: 'Dakar Immo', slug: 'd' }, status: 'active', created_at: null },
    { id: 'owner:8', type: 'owner', numeric_id: 8, agency_id: 2, agency: { id: 2, name: 'Thiès Properties', slug: 't' }, status: 'active', created_at: null },
  ],
  meta: { active_profile_id: 'agent:3', count: 2 },
};
const THIES = { data: { profile_id: 'owner:8', agency: { id: 2, name: 'Thiès Properties' }, role: 'owner' } };
const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('TCK-2848 — la carte survit à la bascule optimiste', () => {
  it('au clic, la requête de bascule en vol : la carte reste, son bouton inactif', async () => {
    const patch = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/api/me/locate')) return Promise.resolve(json(THIES));
        if (u.includes('/api/me/active-profile')) {
          patch(init?.method);
          return new Promise<Response>(() => {});
        }
        return Promise.resolve(json(PROFILS));
      }),
    );
    const user = { id: 41, roles: ['agent'], agency_id: 1, preferences: {} } as unknown as User;
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
          <ContexteDuMenuDeLaCoque.Provider
            value={{ user, agencyIsStandard: true, typeProfilActif: 'agent', modulesMasques: [], espaceActif: 'agent:3' }}
          >
            <AutreEspaceDeLIntrouvable />
          </ContexteDuMenuDeLaCoque.Provider>
        </QueryClientProvider>,
      ),
    );
    const bouton = await screen.findByRole('button', { name: 'Basculer vers Thiès Properties' });
    await userEvent.setup().click(bouton);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('PATCH'));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole('button', { name: 'Basculer vers Thiès Properties' })).toBeDisabled();
  });
});
