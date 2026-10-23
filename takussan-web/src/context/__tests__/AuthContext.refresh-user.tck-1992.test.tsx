/**
 * TCK-1992 (P172.01, P172.03) — `refreshUser` ne ferme la session que sur un 401, et n'applique
 * que la réponse de la dernière demande.
 *
 * Mesuré le 2026-10-23 : un relais en erreur faisait `setUser(null)`, et un 401 (que le relais
 * rendait pour toute panne) enchaînait sur `POST /api/auth/logout` ; deux `refreshUser()` lancés
 * ensemble, la première réponse arrivée la dernière, laissaient le compte de la première.
 */
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';

vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: vi.fn().mockResolvedValue([]),
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');

const COMPTE = { id: 7, first_name: 'Astou', last_name: 'Dieng', roles: [], agency_id: 1 } as unknown as User;

const sonde: { auth: ReturnType<typeof useAuth> | null } = { auth: null };
function Sonde() {
  const auth = useAuth();
  useEffect(() => {
    sonde.auth = auth;
  });
  return null;
}

function monter() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider initialUser={COMPTE} initialToken="jeton">
        <Sonde />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

type Reponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const reponse = (status: number, corps: unknown = null): Reponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corps,
});

const appelsLogout = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.filter(([url]) => url === '/api/auth/logout');

describe('AuthProvider — refreshUser (TCK-1992)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sonde.auth = null;
    fetchMock = vi.fn(async () => reponse(200, COMPTE));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([503, 502, 500, 403, 429])('un relais en %i garde l’utilisateur et ne déconnecte pas', async (status) => {
    fetchMock.mockImplementation(async () => reponse(status));
    monter();

    await act(async () => {
      await sonde.auth!.refreshUser();
    });

    expect(sonde.auth!.user?.id).toBe(7);
    expect(sonde.auth!.isLoading).toBe(false);
    expect(appelsLogout(fetchMock)).toHaveLength(0);
  });

  it('un relais injoignable garde l’utilisateur', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    monter();

    await act(async () => {
      await sonde.auth!.refreshUser();
    });

    expect(sonde.auth!.user?.id).toBe(7);
    expect(appelsLogout(fetchMock)).toHaveLength(0);
  });

  it('un 401 ferme la session : utilisateur nul et POST /api/auth/logout', async () => {
    fetchMock.mockImplementation(async () => reponse(401));
    monter();

    await act(async () => {
      await sonde.auth!.refreshUser();
    });

    expect(sonde.auth!.user).toBeNull();
    expect(appelsLogout(fetchMock)).toHaveLength(1);
  });

  it('deux refreshUser() aux réponses inversées : la dernière demande l’emporte', async () => {
    const enAttente: Array<(r: Reponse) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Reponse>((resoudre) => enAttente.push(resoudre)),
    );
    monter();

    let premiere!: Promise<void>;
    let seconde!: Promise<void>;
    act(() => {
      premiere = sonde.auth!.refreshUser();
      seconde = sonde.auth!.refreshUser();
    });
    expect(enAttente).toHaveLength(2);

    await act(async () => {
      enAttente[1](reponse(200, { ...COMPTE, agency_id: 2 }));
      await seconde;
      enAttente[0](reponse(200, { ...COMPTE, agency_id: 1 }));
      await premiere;
    });

    expect(sonde.auth!.user?.agency_id).toBe(2);
    expect(sonde.auth!.isLoading).toBe(false);
  });

  it('une réponse arrivée après logout() ne remet pas d’utilisateur', async () => {
    const enAttente: Array<(r: Reponse) => void> = [];
    fetchMock.mockImplementation((url: string) =>
      url === '/api/auth/me'
        ? new Promise<Reponse>((resoudre) => enAttente.push(resoudre))
        : Promise.resolve(reponse(200)),
    );
    monter();

    let enVol!: Promise<void>;
    act(() => {
      enVol = sonde.auth!.refreshUser();
    });
    await act(async () => {
      await sonde.auth!.logout();
    });
    expect(sonde.auth!.user).toBeNull();

    await act(async () => {
      enAttente[0](reponse(200, COMPTE));
      await enVol;
    });

    expect(sonde.auth!.user).toBeNull();
    expect(sonde.auth!.isLoading).toBe(false);
  });
});
