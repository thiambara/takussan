/**
 * TCK-509 (AC3) — la déconnexion de la `Navbar` publique ne laisse rien de la session de A.
 *
 * Elle appelait le route handler puis `setUser(null)` : l'utilisateur disparaissait de l'écran,
 * mais le JETON de A restait dans le contexte, et le cache React Query gardait les réponses
 * obtenues sous A. B, connecté ensuite sans rechargement, lisait l'API avec le jeton révoqué de A.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/lib/auth';

const loginMock = vi.fn();
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  login: (...args: unknown[]) => loginMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => null,
  OAuthSeparator: () => null,
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { useApiQuery } = await import('@/hooks/useApiQuery');
const { createQueryClient } = await import('@/lib/query-client');
const { getIds: favorisLocaux } = await import('@/lib/favoritesStore');
const { Navbar } = await import('@/components/home/Navbar');
const { default: LoginPage } = await import('@/app/(auth)/auth/login/page');

const A = {
  id: 7, first_name: 'Astou', last_name: 'Dieng', full_name: 'Astou Dieng',
  email: 'owner1@dakarimmo.sn', roles: [],
} as unknown as User;
const B = {
  id: 3, first_name: 'Ousmane', last_name: 'Ndiaye', full_name: 'Ousmane Ndiaye',
  email: 'agent1@dakarimmo.sn', roles: [],
} as unknown as User;

const FAVORIS: Record<string, number[]> = { 'Bearer jeton-A': [42], 'Bearer jeton-B': [7] };
let appels: { url: string; auth: string | null }[] = [];

function reponse(corps: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => corps } as unknown as Response;
}

function serveur(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const auth = new Headers(init?.headers).get('Authorization');
  appels.push({ url, auth });
  if (url.endsWith('/api/sonde')) return Promise.resolve(reponse({ vu: auth }));
  if (url.includes('/api/favorites')) {
    const ids = auth ? FAVORIS[auth] : undefined;
    return Promise.resolve(
      ids ? reponse({ data: ids.map((property_id) => ({ property_id })), meta: {} }) : reponse({}, 401),
    );
  }
  // Forme de la recherche par identifiants que lit le popover des favoris de la `Navbar`.
  return Promise.resolve(reponse({ ok: true, data: [], meta: { requested_ids: [], returned_ids: [] } }));
}

function Sonde() {
  const { user } = useAuth();
  const { data } = useApiQuery<{ vu: string | null }>(['sonde'], '/api/sonde', { enabled: !!user });
  return <p data-testid="sonde">{data ? (data.vu ?? 'aucun') : '…'}</p>;
}

describe('Navbar publique — déconnexion (TCK-509, AC3)', () => {
  beforeEach(() => {
    appels = [];
    window.localStorage.clear();
    Object.values(router).forEach((fn) => fn.mockReset());
    loginMock.mockReset();
    vi.stubGlobal('fetch', vi.fn(serveur));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('A se déconnecte par la Navbar, B se connecte sur le même arbre : tout part avec le jeton de B', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ token: 'jeton-B', user: B });
    render(
      <QueryClientProvider client={createQueryClient()}>
        {withIntl(
          <AuthProvider initialUser={A} initialToken="jeton-A">
            <Sonde />
            <Navbar />
            <LoginPage />
          </AuthProvider>,
        )}
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Bearer jeton-A')).toBeInTheDocument();
    await waitFor(() => expect(favorisLocaux()).toEqual([42]));

    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }));
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const apresDeconnexion = appels.length;
    expect(appels.some((a) => a.url === '/api/auth/logout')).toBe(true);
    await waitFor(() => expect(favorisLocaux()).toEqual([]));

    await user.type(screen.getByLabelText('Adresse email*'), 'agent1@dakarimmo.sn');
    await user.type(screen.getByLabelText('Mot de passe*'), 'password');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(appels.slice(apresDeconnexion).filter((a) => a.auth === 'Bearer jeton-A')).toEqual([]);
    await waitFor(() => expect(favorisLocaux()).toEqual([7]));
  });
});
