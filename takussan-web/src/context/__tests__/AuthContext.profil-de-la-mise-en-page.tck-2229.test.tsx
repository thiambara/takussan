/**
 * TCK-2229 (P197.06) — un profil actif changé par la mise en page racine oublie le cache de
 * l'ancien profil, comme un changement confirmé par le menu (TCK-2091).
 *
 * Les parcours d'accueil posent le cookie `active_profile_id` par une action serveur : la mise en
 * page rend alors un autre `initialActiveProfileId`, qu'`AuthProvider` adopte sans passer par
 * `useSwitchActiveProfile`. Avant ce ticket, les lectures d'agence en cache gardaient l'agence
 * quittée jusqu'à leur `staleTime`.
 *
 * Décision du porteur (déléguée) : même prédicat que l'`onSuccess` de `useSwitchActiveProfile`
 * (tout hors `['me','profiles']`), appelé dans un effet, seulement quand la mise en page rend un
 * profil que le client ne tient pas déjà : le `router.refresh()` d'un changement par le menu
 * n'oublie pas le cache une seconde fois.
 */
import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';

const { AuthProvider, useAuth } = await import('@/context/AuthContext');

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const awa = { id: 1, first_name: 'Awa', roles: ['owner'] } as unknown as User;
const SOLDE: QueryKey = ['credits', 'solde'];
const PROFILS: QueryKey = ['me', 'profiles'];

function Lecteur() {
  const { activeProfileId, setActiveProfileId } = useAuth();
  return (
    <>
      <p data-testid="profil">{activeProfileId ?? 'aucun'}</p>
      <button type="button" onClick={() => setActiveProfileId('agency_admin:2')}>
        menu
      </button>
    </>
  );
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(SOLDE, { agence: 'A' });
  queryClient.setQueryData(PROFILS, { data: [], meta: { active_profile_id: 'owner:1' } });
  const arbre = (profil: string | null): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={awa} initialToken="jeton-1" initialActiveProfileId={profil}>
        <Lecteur />
      </AuthProvider>
    </QueryClientProvider>
  );
  const rendu = render(arbre('owner:1'));
  return { queryClient, rerender: (profil: string | null) => rendu.rerender(arbre(profil)) };
}

describe('AuthProvider — profil actif changé par la mise en page', () => {
  it('oublie une lecture d’agence et garde les profils quand la mise en page rend un autre profil', async () => {
    const { queryClient, rerender } = monter();

    rerender('agency_admin:2');

    expect(screen.getByTestId('profil').textContent).toBe('agency_admin:2');
    await waitFor(() => expect(queryClient.getQueryData(SOLDE)).toBeUndefined());
    expect(queryClient.getQueryData(PROFILS)).toEqual({ data: [], meta: { active_profile_id: 'owner:1' } });
  });

  it('n’oublie rien quand la mise en page rend le profil que le client a déjà posé (menu puis `router.refresh()`)', async () => {
    const { queryClient, rerender } = monter();

    act(() => screen.getByRole('button', { name: 'menu' }).click());
    // Le `onSuccess` du menu a déjà réinitialisé le cache ; on remet une donnée neuve, relue sous
    // le nouveau profil, que le rendu qui suit le `router.refresh()` ne doit pas oublier.
    queryClient.setQueryData(SOLDE, { agence: 'B' });
    rerender('agency_admin:2');

    expect(screen.getByTestId('profil').textContent).toBe('agency_admin:2');
    await new Promise((r) => setTimeout(r, 20));
    expect(queryClient.getQueryData(SOLDE)).toEqual({ agence: 'B' });
  });

  it('n’oublie rien quand la mise en page rend de nouveau le même profil', async () => {
    const { queryClient, rerender } = monter();

    rerender('owner:1');

    await new Promise((r) => setTimeout(r, 20));
    expect(queryClient.getQueryData(SOLDE)).toEqual({ agence: 'A' });
  });
});
