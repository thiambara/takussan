/**
 * TCK-509 — une page `/auth/*` montée avec une session côté client la referme ; elle ne referme
 * jamais celle qu'on ouvre pendant qu'elle est affichée.
 */
import { render, screen, waitFor } from '@testing-library/react';
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

function serveur(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const auth = new Headers(init?.headers).get('Authorization');
  appels.push({ url, auth });
  const corps = url.endsWith('/api/sonde') ? { vu: auth } : { ok: true, data: [], meta: {} };
  return Promise.resolve({ ok: true, status: 200, json: async () => corps } as unknown as Response);
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

function monter(ui: React.ReactNode, session: { user: User | null; token: string | null }) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      {withIntl(
        <AuthProvider initialUser={session.user} initialToken={session.token}>
          {ui}
        </AuthProvider>,
      )}
    </QueryClientProvider>,
  );
}

const deconnexions = () => appels.filter((a) => a.url === '/api/auth/logout').length;

describe('ReinitialiserSessionClient', () => {
  beforeEach(() => {
    appels = [];
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(serveur));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('referme la session que le client croit encore ouverte en arrivant sur /auth/*', async () => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([42]));
    expect(getFavoris()).toEqual([42]); // témoin : le store lit bien ce que le test a posé
    monter(
      <>
        <Sonde />
        <ReinitialiserSessionClient />
      </>,
      { user: A, token: 'jeton-A' },
    );

    await waitFor(() => expect(deconnexions()).toBe(1));
    await waitFor(() => expect(screen.getByTestId('sonde')).toHaveTextContent('aucun'));
    expect(getFavoris()).toEqual([]);
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
    expect(deconnexions()).toBe(0);
  });
});
