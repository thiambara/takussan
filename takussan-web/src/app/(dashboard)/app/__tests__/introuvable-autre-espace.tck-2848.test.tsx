/**
 * TCK-2848 — la variante « autre espace » de l'introuvable de `/app` : quand `GET /api/me/locate`
 * (TCK-2847) nomme un autre espace du compte, la page dit « Ce bien est dans l'espace Thiès Properties »
 * et propose « Basculer vers Thiès Properties » ; le geste passe par la bascule existante puis rouvre
 * l'URL demandée en entier. Un 404 de l'API (AC2), le profil actif lui-même, ou un échec : rien.
 *
 * `fetch` est doublé (la lecture passe par le vrai `useApiQuery`) ; la bascule est doublée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ContexteDuMenuDeLaCoque } from '@/components/layout/contexte-du-menu-de-la-coque';
import type { User } from '@/types/user';
import { AutreEspaceDeLIntrouvable } from '../AutreEspaceDeLIntrouvable';

const chemin = vi.hoisted(() => ({ courant: '/app/properties/48' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.courant,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
const bascule = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: {
      data: [
        { id: 'agent:3', type: 'agent', agency_id: 1, agency: { id: 1, name: 'Dakar Immo', slug: 'dakar-immo' } },
        { id: 'owner:8', type: 'owner', agency_id: 2, agency: { id: 2, name: 'Thiès Properties', slug: 'thies' } },
      ],
      meta: { active_profile_id: 'agent:3', count: 2 },
    },
  }),
  useSwitchActiveProfile: () => bascule,
}));

const user = { id: 41, first_name: 'Sokhna', last_name: 'Sène', roles: ['agent'], agency_id: 1, preferences: {} } as unknown as User;

function repondre(statut: number, corps: unknown) {
  const appels: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      appels.push(String(url));
      return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return appels;
}

function monter() {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ContexteDuMenuDeLaCoque.Provider
          value={{ user, agencyIsStandard: true, typeProfilActif: 'agent', modulesMasques: [], espaceActif: 'agent:3' }}
        >
          <AutreEspaceDeLIntrouvable />
        </ContexteDuMenuDeLaCoque.Provider>
      </QueryClientProvider>,
    ),
  );
}

const THIES = { data: { profile_id: 'owner:8', agency: { id: 2, name: 'Thiès Properties' }, role: 'owner' } };
const localisation = window.location;

beforeEach(() => {
  chemin.courant = '/app/properties/48';
  bascule.mutate.mockReset();
  bascule.isPending = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { configurable: true, value: localisation });
});

describe('TCK-2848 — l’introuvable propose de basculer vers l’espace de la fiche', () => {
  it('AC1 — un locate positif : « Ce bien est dans l’espace Thiès Properties » et « Basculer vers Thiès Properties »', async () => {
    const appels = repondre(200, THIES);
    monter();
    expect(await screen.findByRole('heading', { name: 'Ce bien est dans l’espace Thiès Properties' })).toBeInTheDocument();
    expect(screen.getByText(/Vous y êtes propriétaire\. Vous travaillez en ce moment dans Dakar Immo\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basculer vers Thiès Properties' })).toBeInTheDocument();
    expect(appels.some((u) => u.includes('/api/me/locate?type=bien&id=48'))).toBe(true);
  });

  it('AC1 — le geste active le profil de Thiès, puis rouvre l’URL demandée en entier', async () => {
    repondre(200, THIES);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...localisation, pathname: '/app/properties/48', search: '?onglet=baux', assign },
    });
    bascule.mutate.mockImplementation((_id: string, options: { onSuccess?: () => void }) => options.onSuccess?.());
    monter();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Basculer vers Thiès Properties' }));
    expect(bascule.mutate).toHaveBeenCalledWith('owner:8', expect.any(Object));
    expect(assign).toHaveBeenCalledWith('/app/properties/48?onglet=baux');
  });

  it('un échec de la bascule rend la page introuvable ordinaire (la variante s’efface)', async () => {
    repondre(200, THIES);
    bascule.mutate.mockImplementation((_id: string, options: { onError?: () => void }) => options.onError?.());
    monter();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Basculer vers Thiès Properties' }));
    expect(screen.queryByRole('button', { name: /Basculer vers/ })).toBeNull();
  });

  it('AC2 — un 404 de l’API (id inexistant, ou illisible partout) : aucune mention d’un autre espace', async () => {
    const appels = repondre(404, { message: 'Not found' });
    monter();
    await waitFor(() => expect(appels.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/dans l’espace/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Basculer vers/ })).toBeNull();
  });

  it('la fiche se lit sous le profil ACTIF : rien à proposer', async () => {
    const appels = repondre(200, { data: { profile_id: 'agent:3', agency: { id: 1, name: 'Dakar Immo' }, role: 'agent' } });
    monter();
    await waitFor(() => expect(appels.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('button', { name: /Basculer vers/ })).toBeNull();
  });

  it('une URL sans fiche localisable (section sans type, id non numérique) ne demande rien à l’API', async () => {
    for (const url of ['/app/documents/5', '/app/properties/abc', '/app/zzz', '/app/properties/0']) {
      chemin.courant = url;
      const appels = repondre(200, THIES);
      const { unmount } = monter();
      await new Promise((r) => setTimeout(r, 20));
      expect(appels).toEqual([]);
      unmount();
    }
  });
});
