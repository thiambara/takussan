/**
 * TCK-509 — une page `/auth/*` montée avec une session côté client la referme si, et seulement si,
 * le serveur la dit fermée ; elle ne referme jamais celle qu'on ouvre pendant qu'elle est affichée.
 *
 * Le cas « session vivante » est le retour arrière : Next restaure `/auth/login` de son cache
 * client, sans requête, donc sans le proxy qui renverrait vers `/app` (revue de la PR 257).
 */
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/lib/auth';

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { useApiQuery } = await import('@/hooks/useApiQuery');
const { createQueryClient } = await import('@/lib/query-client');
const { ReinitialiserSessionClient } = await import('@/components/auth/ReinitialiserSessionClient');
const { FAVORITES_STORAGE_KEY, getIds: getFavoris } = await import('@/lib/favoritesStore');

const A = { id: 7, first_name: 'Astou', last_name: 'Dieng', roles: [] } as unknown as User;
const B = { id: 3, first_name: 'Ousmane', last_name: 'Ndiaye', roles: [] } as unknown as User;

let appels: { url: string; auth: string | null }[] = [];
/** Ce que `/api/auth/me` — donc le cookie, côté serveur — dit de la session. */
let sessionServeur: 'vivante' | 'fermee' | 'en-attente' = 'fermee';
let repondreMe: ((r: Response) => void) | null = null;

const reponse = (status: number, corps: unknown) =>
  ({ ok: status < 400, status, json: async () => corps }) as unknown as Response;

function serveur(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const auth = new Headers(init?.headers).get('Authorization');
  appels.push({ url, auth });
  if (url === '/api/auth/me') {
    if (sessionServeur === 'en-attente') {
      return new Promise<Response>((resolve) => {
        repondreMe = resolve;
      });
    }
    return Promise.resolve(sessionServeur === 'vivante' ? reponse(200, A) : reponse(401, null));
  }
  if (url.endsWith('/api/sonde')) return Promise.resolve(reponse(200, { vu: auth }));
  if (url.includes('/api/favorites')) {
    // Les cœurs de A : ce que l'effet d'amorçage range dans le store local tant que A est connecté.
    const data = auth === 'Bearer jeton-A' ? [{ property_id: 42 }] : [];
    return Promise.resolve(reponse(200, { data, meta: {} }));
  }
  return Promise.resolve(reponse(200, { ok: true, data: [], meta: {} }));
}

function Sonde() {
  const { data } = useApiQuery<{ vu: string | null }>(['sonde'], '/api/sonde');
  return <p data-testid="sonde">{data ? (data.vu ?? 'aucun') : '…'}</p>;
}

function OuvrirB() {
  const { openSession } = useAuth();
  return (
    <button type="button" onClick={() => void openSession('jeton-B', B)}>
      ouvrir
    </button>
  );
}

function monter(
  ui: React.ReactNode,
  session: { user: User | null; token: string | null },
  { strict = false } = {},
) {
  const arbre = (
    <QueryClientProvider client={createQueryClient()}>
      {withIntl(
        <AuthProvider initialUser={session.user} initialToken={session.token}>
          {ui}
        </AuthProvider>,
      )}
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{arbre}</StrictMode> : arbre);
}

const deconnexions = () => appels.filter((a) => a.url === '/api/auth/logout').length;
const verifications = () => appels.filter((a) => a.url === '/api/auth/me').length;

describe('ReinitialiserSessionClient', () => {
  beforeEach(() => {
    appels = [];
    sessionServeur = 'fermee';
    repondreMe = null;
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(serveur));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('referme la session que le client croit ouverte quand le serveur la dit fermée — une fois', async () => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([42]));
    expect(getFavoris()).toEqual([42]); // témoin : le store lit bien ce que le test a posé
    // StrictMode, comme `next dev` : l'effet est monté deux fois, la déconnexion ne part qu'une.
    monter(
      <>
        <Sonde />
        <ReinitialiserSessionClient />
      </>,
      { user: A, token: 'jeton-A' },
      { strict: true },
    );

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('aucun'));
    await waitFor(() => expect(getFavoris()).toEqual([]));
    await act(async () => {});
    expect(verifications()).toBeGreaterThanOrEqual(1);
    expect(deconnexions()).toBe(1);
  });

  it('ne referme pas une session que le serveur tient encore — le retour arrière', async () => {
    sessionServeur = 'vivante';
    monter(
      <>
        <Sonde />
        <ReinitialiserSessionClient />
      </>,
      { user: A, token: 'jeton-A' },
    );

    // Témoin : la question a bien été posée au serveur — sinon « aucune déconnexion » ne prouve rien.
    await waitFor(() => expect(verifications()).toBe(1));
    await waitFor(() => expect(getFavoris()).toEqual([42]));
    await act(async () => {});

    expect(deconnexions()).toBe(0);
    expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-A');
    expect(getFavoris()).toEqual([42]);
  });

  it('ne referme pas une session ouverte PENDANT la vérification', async () => {
    sessionServeur = 'en-attente';
    const user = userEvent.setup();
    monter(
      <>
        <Sonde />
        <OuvrirB />
        <ReinitialiserSessionClient />
      </>,
      { user: A, token: 'jeton-A' },
    );

    await waitFor(() => expect(repondreMe).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));

    // La réponse qui arrive maintenant jugeait la session de A, plus celle en vigueur.
    await act(async () => {
      repondreMe?.(reponse(401, null));
    });

    expect(deconnexions()).toBe(0);
    expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B');
  });

  it('ne fait rien quand le client n’a pas de session au montage', async () => {
    monter(
      <>
        <Sonde />
        <ReinitialiserSessionClient />
      </>,
      { user: null, token: null },
    );

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('aucun'));
    expect(verifications()).toBe(0);
    expect(deconnexions()).toBe(0);
  });

  it('ne referme pas une session ouverte APRÈS le montage (la connexion elle-même)', async () => {
    const user = userEvent.setup();
    monter(
      <>
        <Sonde />
        <OuvrirB />
        <ReinitialiserSessionClient />
      </>,
      { user: null, token: null },
    );

    await user.click(screen.getByRole('button', { name: 'ouvrir' }));

    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('Bearer jeton-B'));
    expect(verifications()).toBe(0);
    expect(deconnexions()).toBe(0);
  });
});
