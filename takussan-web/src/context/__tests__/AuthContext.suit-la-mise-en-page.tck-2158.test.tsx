/**
 * TCK-2158 (P202.01) — le contexte d'authentification suit l'utilisateur que lui rend la mise en
 * page racine.
 *
 * Le layout racine relit `/api/auth/me` à chaque rendu serveur (`router.refresh()`, action
 * serveur), mais `AuthProvider` posait `user` et `token` une fois, au montage : tout geste qui
 * change `/me` sans `setUser` ni `refreshUser` laissait l'ancien compte aux lecteurs de `useAuth()`.
 *
 * Décision du porteur (2026-10-24) : `AuthProvider` suit `initialUser` quand il est non nul et ne
 * vide le compte que si `initialToken` passe aussi à `null` ; un `null` avec un jeton présent
 * (échec ou délai de `/me`) garde le compte, comme TCK-1992.
 */
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const awa = { id: 1, first_name: 'Awa', roles: ['customer'], two_factor_enabled: false } as unknown as User;
const aissatou = {
  id: 1,
  first_name: 'Aïssatou',
  roles: ['owner', 'customer'],
  two_factor_enabled: true,
} as unknown as User;

function Lecteur() {
  const { user, token } = useAuth();
  const roles = (user as unknown as { roles?: string[] } | null)?.roles?.join(',') ?? '-';
  const deuxFacteurs = (user as unknown as { two_factor_enabled?: boolean } | null)?.two_factor_enabled;
  return (
    <p data-testid="compte">
      {user ? `${user.first_name}|${roles}|${String(deuxFacteurs)}` : 'aucun'}#{token ?? 'sans-jeton'}
    </p>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function arbre(initialUser: User | null, initialToken: string | null): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={initialUser} initialToken={initialToken}>
        <Lecteur />
      </AuthProvider>
    </QueryClientProvider>
  );
}

const compte = () => screen.getByTestId('compte').textContent;

describe('AuthProvider suit la mise en page racine', () => {
  it('pose le nouvel utilisateur que rend la mise en page', () => {
    const { rerender } = render(arbre(awa, 'jeton-1'));
    expect(compte()).toBe('Awa|customer|false#jeton-1');

    rerender(arbre(aissatou, 'jeton-1'));
    expect(compte()).toBe('Aïssatou|owner,customer|true#jeton-1');
  });

  it('garde le compte quand `/me` manque mais que le jeton est toujours là', () => {
    const { rerender } = render(arbre(awa, 'jeton-1'));

    rerender(arbre(null, 'jeton-1'));
    expect(compte()).toBe('Awa|customer|false#jeton-1');
  });

  it('vide le compte quand la mise en page ne rend plus ni utilisateur ni jeton', () => {
    const { rerender } = render(arbre(awa, 'jeton-1'));

    rerender(arbre(null, null));
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('suit un jeton neuf rendu par la mise en page', () => {
    const { rerender } = render(arbre(awa, 'jeton-1'));

    rerender(arbre(aissatou, 'jeton-2'));
    expect(compte()).toBe('Aïssatou|owner,customer|true#jeton-2');
  });

  it("n'écrase pas un compte posé au client tant que la mise en page ne rend rien de neuf", () => {
    function Poseur() {
      const { setUser } = useAuth();
      return (
        <button type="button" onClick={() => setUser(aissatou)}>
          poser
        </button>
      );
    }
    const avecPoseur = (u: User | null) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialUser={u} initialToken="jeton-1">
          <Lecteur />
          <Poseur />
        </AuthProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(avecPoseur(awa));
    screen.getByRole('button').click();
    rerender(avecPoseur(awa));
    expect(compte()).toBe('Aïssatou|owner,customer|true#jeton-1');
  });
});
