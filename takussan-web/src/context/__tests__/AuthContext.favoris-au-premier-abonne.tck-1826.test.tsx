/**
 * TCK-1826 (P136.05) — les favoris d'un utilisateur connecté se lisent au premier abonné du
 * magasin (`useFavorites`), pas à chaque chargement de document.
 *
 * Mesuré le 2026-10-23 : `AuthProvider` lisait tous les favoris dès son montage, sur tout écran,
 * même sans cœur affiché (console d'agence, `/super-admin`).
 */
import { useEffect, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';

const favoris = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: favoris.lire,
}));

const { AuthProvider } = await import('@/context/AuthContext');
const { useFavorites } = await import('@/lib/favoritesStore');

const COMPTE = { id: 7, first_name: 'Astou', last_name: 'Dieng', roles: [], agency_id: 3 } as unknown as User;

function Coeur() {
  const { count } = useFavorites();
  return <p data-testid="compte">{count}</p>;
}

const sonde: { montrer: (n: number) => void } = { montrer: () => {} };
function Ecran() {
  const [coeurs, setCoeurs] = useState(0);
  useEffect(() => {
    sonde.montrer = setCoeurs;
  }, []);
  return (
    <>
      {Array.from({ length: coeurs }, (_, i) => (
        <Coeur key={i} />
      ))}
    </>
  );
}

function monter() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider initialUser={COMPTE} initialToken="jeton">
        <Ecran />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AuthProvider — favoris lus au premier abonné du magasin (TCK-1826)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    favoris.lire.mockReset().mockResolvedValue([42, 43]);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => COMPTE })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('AC1 — sans abonné du magasin, aucun favori n’est lu', async () => {
    monter();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(favoris.lire).not.toHaveBeenCalled();
  });

  it('AC2/AC3 — le premier abonné déclenche une seule lecture, même à deux', async () => {
    monter();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(favoris.lire).not.toHaveBeenCalled();

    act(() => sonde.montrer(2));

    await waitFor(() => expect(screen.getAllByTestId('compte')[0]).toHaveTextContent('2'));
    expect(favoris.lire).toHaveBeenCalledTimes(1);
    expect(favoris.lire).toHaveBeenCalledWith('jeton');

    act(() => sonde.montrer(0));
    act(() => sonde.montrer(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(favoris.lire).toHaveBeenCalledTimes(1);
  });
});
