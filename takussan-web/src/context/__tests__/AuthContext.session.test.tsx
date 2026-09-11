/**
 * TCK-509 — le jeton que le navigateur transmet est celui de la session EN VIGUEUR.
 *
 * Mesuré au navigateur le 2026-09-10 : après « A se déconnecte, B se connecte » sans rechargement,
 * chaque appel client direct à l'API partait avec le jeton RÉVOQUÉ de A (401), et un premier login
 * depuis `/auth/login` chargée à froid n'en envoyait aucun. Le jeton vivait à deux endroits — le
 * cookie httpOnly et l'état du contexte, initialisé une fois par le layout racine — et aucun chemin
 * d'entrée ni de sortie ne mettait le second à jour.
 *
 * ⚠ Ces tests montent les VRAIS points d'entrée (`LoginPage`, l'inscription, le callback OAuth) et
 * de sortie (`UserMenu`) sur UN SEUL arbre React, avec le vrai `createQueryClient()` (5 min de
 * `staleTime`) : c'est cette combinaison qui rend la fuite visible. Un test qui appellerait le
 * contexte directement serait vert sur le code fautif — le défaut vivait dans les pages qui le
 * contournaient.
 */
import { Suspense } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/lib/auth';

const loginMock = vi.fn();
const registerMock = vi.fn();
const oauthCallbackMock = vi.fn();
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  login: (...args: unknown[]) => loginMock(...args),
  register: (...args: unknown[]) => registerMock(...args),
  oauthCallback: (...args: unknown[]) => oauthCallbackMock(...args),
}));

// La déconnexion par server action n'a qu'un effet VISIBLE du client : la navigation qu'emporte son
// `redirect()`. L'effacement du cookie a lieu côté serveur, hors de portée du contexte — c'est
// précisément le défaut. Ce double ne sert qu'à ce que l'ablation (le code d'avant) rougisse pour
// la bonne raison plutôt que sur un `cookies()` appelé hors requête.
vi.mock('@/app/actions/auth', () => ({
  logoutAction: async () => {
    router.replace('/auth/login');
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
  usePathname: () => '/auth/login',
}));

vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => null,
  OAuthSeparator: () => null,
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { useApiQuery } = await import('@/hooks/useApiQuery');
const { createQueryClient } = await import('@/lib/query-client');
const { getIds: favorisLocaux } = await import('@/lib/favoritesStore');
const { UserMenu } = await import('@/components/layout/UserMenu');
const { default: LoginPage } = await import('@/app/(auth)/auth/login/page');
const { default: RegisterPage } = await import('@/app/(auth)/auth/register/page');
const { default: OAuthCallbackPage } = await import('@/app/(auth)/auth/oauth/[provider]/callback/page');

const A = {
  id: 7,
  first_name: 'Astou',
  last_name: 'Dieng',
  full_name: 'Astou Dieng',
  email: 'owner1@dakarimmo.sn',
  roles: [],
} as unknown as User;

const B = {
  id: 3,
  first_name: 'Ousmane',
  last_name: 'Ndiaye',
  full_name: 'Ousmane Ndiaye',
  email: 'agent1@dakarimmo.sn',
  roles: [],
} as unknown as User;

/** Les favoris « serveur » de chacun, indexés par l'en-tête qui les demande. */
const FAVORIS: Record<string, number[]> = { 'Bearer jeton-A': [42], 'Bearer jeton-B': [7] };

interface Appel {
  readonly url: string;
  readonly auth: string | null;
  readonly corps?: unknown;
}
let appels: Appel[] = [];

function reponse(corps: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => corps } as unknown as Response;
}

function serveur(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const auth = new Headers(init?.headers).get('Authorization');
  const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  appels.push({ url, auth, corps });

  if (url.endsWith('/api/sonde')) return Promise.resolve(reponse({ vu: auth }));
  if (url.includes('/api/favorites')) {
    const ids = auth ? FAVORIS[auth] : undefined;
    return Promise.resolve(
      ids
        ? reponse({ data: ids.map((property_id) => ({ property_id })), meta: {} })
        : reponse({ message: 'Unauthenticated.' }, 401),
    );
  }
  if (url === '/api/auth/me') return Promise.resolve(reponse(B));
  return Promise.resolve(reponse({ ok: true }));
}

/**
 * Un composant client quelconque de `/app` qui lit l'API en direct — ce que font
 * `conversations`, `property-visits` et les 27 appelants de `useApiQuery`. Il affiche l'en-tête
 * que le serveur a VU : la réponse porte donc l'identité sous laquelle elle a été obtenue.
 */
function Sonde({ seulementConnecte = false }: { readonly seulementConnecte?: boolean }) {
  const { user } = useAuth();
  const { data } = useApiQuery<{ vu: string | null }>(['sonde'], '/api/sonde', {
    enabled: seulementConnecte ? !!user : true,
  });
  return <p data-testid="sonde">{data ? (data.vu ?? 'aucun') : '…'}</p>;
}

function monter(
  ui: React.ReactNode,
  session: { user: User | null; token: string | null },
): QueryClient {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      {withIntl(
        <AuthProvider initialUser={session.user} initialToken={session.token}>
          {ui}
        </AuthProvider>,
      )}
    </QueryClientProvider>,
  );
  return client;
}

async function seConnecter(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText('Adresse email*'), email);
  await user.type(screen.getByLabelText('Mot de passe*'), 'password');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

const vus = (url: string) => appels.filter((a) => a.url.endsWith(url)).map((a) => a.auth);

describe('TCK-509 — le jeton client suit la session, sans rechargement', () => {
  beforeEach(() => {
    appels = [];
    searchParams = new URLSearchParams();
    window.localStorage.clear();
    Object.values(router).forEach((fn) => fn.mockReset());
    loginMock.mockReset();
    registerMock.mockReset();
    oauthCallbackMock.mockReset();
    vi.stubGlobal('fetch', vi.fn(serveur));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC2/AC4/AC5 — A se déconnecte par le menu de /app, B se connecte sur le même arbre', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ token: 'jeton-B', user: B });
    const client = monter(
      <>
        <Sonde />
        <UserMenu user={A} />
        <LoginPage />
      </>,
      { user: A, token: 'jeton-A' },
    );

    // Témoin : la session de A fonctionne, ses favoris sont semés.
    expect(await screen.findByText('Bearer jeton-A')).toBeInTheDocument();
    await waitFor(() => expect(favorisLocaux()).toEqual([42]));

    await user.click(screen.getByRole('button', { name: 'Menu utilisateur — Astou Dieng' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Déconnexion' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/login'));
    const apresDeconnexion = appels.length;

    // AC5 — rien de A ne reste dans le store local.
    await waitFor(() => expect(favorisLocaux()).toEqual([]));

    await seConnecter(user, 'agent1@dakarimmo.sn');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/app'));

    // AC2 — la sonde a été relue, et sous l'identité de B.
    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(appels.slice(apresDeconnexion).filter((a) => a.auth === 'Bearer jeton-A')).toEqual([]);

    // AC4 — aucune réponse obtenue sous A ne survit dans le cache.
    const sousA = client
      .getQueryCache()
      .getAll()
      .filter((q) => (q.state.data as { vu?: string } | undefined)?.vu === 'Bearer jeton-A');
    expect(sousA).toEqual([]);

    // AC5 — les favoris de B, pas ceux de A.
    await waitFor(() => expect(favorisLocaux()).toEqual([7]));
  });

  it('AC1 — premier login depuis /auth/login chargée à froid : la requête porte le jeton', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ token: 'jeton-B', user: B });
    monter(
      <>
        <Sonde seulementConnecte />
        <LoginPage />
      </>,
      { user: null, token: null },
    );

    await seConnecter(user, 'agent1@dakarimmo.sn');

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(vus('/api/sonde')).toEqual(['Bearer jeton-B']);
    expect(appels.find((a) => a.url === '/api/auth/set-token')?.corps).toEqual({ token: 'jeton-B' });
  });

  it('AC8 — l’étape 2FA ouvre la session comme le login simple', async () => {
    const user = userEvent.setup();
    loginMock
      .mockResolvedValueOnce({ requires_2fa: true })
      .mockResolvedValueOnce({ token: 'jeton-B', user: B });
    monter(
      <>
        <Sonde seulementConnecte />
        <LoginPage />
      </>,
      { user: null, token: null },
    );

    await seConnecter(user, 'agent1@dakarimmo.sn');
    await user.type(await screen.findByLabelText('Code à 6 chiffres'), '123456');
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(vus('/api/sonde')).toEqual(['Bearer jeton-B']);
  });

  it('AC8 — le callback OAuth ouvre la session', async () => {
    searchParams = new URLSearchParams('code=le-code&state=l-etat');
    oauthCallbackMock.mockResolvedValue({ token: 'jeton-B', user: B });

    await act(async () => {
      monter(
        <>
          <Sonde seulementConnecte />
          <Suspense fallback={null}>
            <OAuthCallbackPage params={Promise.resolve({ provider: 'google' })} />
          </Suspense>
        </>,
        { user: null, token: null },
      );
    });

    // D'abord la preuve que le callback a bien tourné : sans elle, un rouge ci-dessous pourrait
    // venir du harnais (page suspendue) plutôt que du jeton.
    await waitFor(() => expect(oauthCallbackMock).toHaveBeenCalledWith('google', 'le-code', 'l-etat'));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(vus('/api/sonde')).toEqual(['Bearer jeton-B']);
  });

  it('l’inscription ouvre la session', async () => {
    const user = userEvent.setup();
    registerMock.mockResolvedValue({ token: 'jeton-B', user: B, message: '' });
    monter(
      <>
        <Sonde seulementConnecte />
        <RegisterPage />
      </>,
      { user: null, token: null },
    );

    await user.type(screen.getByLabelText('Prénom*'), 'Ousmane');
    await user.type(screen.getByLabelText('Nom*'), 'Ndiaye');
    await user.type(screen.getByLabelText('Adresse email*'), 'agent1@dakarimmo.sn');
    await user.type(screen.getByLabelText('Mot de passe*'), 'motdepasse1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe*'), 'motdepasse1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(vus('/api/sonde')).toEqual(['Bearer jeton-B']);
  });
});
