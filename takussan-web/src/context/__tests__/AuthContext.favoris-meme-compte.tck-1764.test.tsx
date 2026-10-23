/**
 * TCK-1764 (P172.04) — un `refreshUser()` qui rend le même compte ne relit pas tous les favoris.
 *
 * Mesuré le 2026-10-23 : l'effet d'amorçage des favoris dépendait de l'objet `user`, que
 * `refreshUser` remplace à chaque appel ; une lecture au montage, trois après deux `refreshUser()`
 * rendant le même compte. La liste des favoris dépend du compte et de son agence
 * (`FavoriteController::index` filtre par `staffAgencyId()`, qui ne lit que `agency_id`) : un
 * changement d'agence la relit toujours.
 */
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';

const favoris = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: favoris.lire,
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');

const COMPTE = { id: 7, first_name: 'Astou', last_name: 'Dieng', roles: [], agency_id: 3 } as unknown as User;

const sonde = { refresh: async () => {} };
function Sonde() {
  const { refreshUser } = useAuth();
  useEffect(() => {
    sonde.refresh = refreshUser;
  }, [refreshUser]);
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

function reponseMe(u: User) {
  return { ok: true, status: 200, json: async () => ({ ...u }) };
}

describe('AuthProvider — favoris et refreshUser (TCK-1764)', () => {
  let reponse: User;

  beforeEach(() => {
    favoris.lire.mockReset().mockResolvedValue([]);
    reponse = COMPTE;
    vi.stubGlobal('fetch', vi.fn(async () => reponseMe(reponse)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('deux refreshUser() rendant le même compte ne relisent pas les favoris', async () => {
    monter();
    await vi.waitFor(() => expect(favoris.lire).toHaveBeenCalledTimes(1));

    await act(async () => {
      await sonde.refresh();
      await sonde.refresh();
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(favoris.lire).toHaveBeenCalledTimes(1);
  });

  it('un changement d’agence relit les favoris', async () => {
    monter();
    await vi.waitFor(() => expect(favoris.lire).toHaveBeenCalledTimes(1));

    reponse = { ...COMPTE, agency_id: 4 } as User;
    await act(async () => {
      await sonde.refresh();
    });

    await vi.waitFor(() => expect(favoris.lire).toHaveBeenCalledTimes(2));
  });
});
