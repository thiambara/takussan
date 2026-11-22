/**
 * TCK-2802 (AC3) — `<CompteDeLaCoque>` sous impersonation.
 *
 * Pendant une impersonation, `AuthContext` n'a jamais de jeton (TCK-600) : c'est le signal
 * `impersonation`, dit par le serveur, qui tient lieu de jeton. Il reste vrai après une
 * déconnexion ou un 401 de `refreshUser` : seul le jugement unique, au montage, empêche alors la
 * coque d'annuler une fermeture venue du client.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { CompteDeLaCoque } = await import('../CompteDeLaCoque');

const agent = { id: 7, first_name: 'Moussa', roles: ['agent'] } as unknown as User;
const awa = { id: 1, first_name: 'Awa', roles: ['customer'] } as unknown as User;

let statutMe = 200;
beforeEach(() => {
  statutMe = 200;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entree) => {
    const url = String(entree);
    if (url === '/api/auth/me') return new Response('{}', { status: statutMe });
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Lecteur() {
  const { user, token, setUser, logout, refreshUser } = useAuth();
  return (
    <>
      <p data-testid="compte">
        {user ? user.first_name : 'aucun'}#{token ?? 'sans-jeton'}
      </p>
      <button type="button" onClick={() => void logout()}>
        sortir
      </button>
      <button type="button" onClick={() => void refreshUser()}>
        relire
      </button>
      <button type="button" onClick={() => setUser(null)}>
        vider
      </button>
    </>
  );
}

function monter(initialUser: User | null, impersonation: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider initialUser={initialUser} initialToken={null}>
        <CompteDeLaCoque utilisateur={agent} impersonation={impersonation} />
        <Lecteur />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const compte = () => screen.getByTestId('compte').textContent;

describe('<CompteDeLaCoque> sous impersonation (TCK-2802)', () => {
  it('sans compte ni jeton, sous impersonation : pose le compte de la coque (la cible)', () => {
    monter(null, true);
    expect(compte()).toBe('Moussa#sans-jeton');
  });

  it('sans compte ni jeton, hors impersonation : rien ne se pose (TCK-2765 AC2)', () => {
    monter(null, false);
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('AC3 — une déconnexion après le montage n’est pas annulée par la coque', async () => {
    monter(null, true);
    expect(compte()).toBe('Moussa#sans-jeton');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'sortir' }));
    });
    await waitFor(() => expect(compte()).toBe('aucun#sans-jeton'));
    // Le signal est toujours vrai : un second passage de l'effet ne doit rien reposer.
    await act(async () => {});
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('AC3 — un contexte vidé après le montage (sortie d’impersonation) reste vide', async () => {
    monter(null, true);
    expect(compte()).toBe('Moussa#sans-jeton');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'vider' }));
    });
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('AC3 — un 401 de `refreshUser` sous impersonation n’est pas annulé par la coque', async () => {
    monter(null, true);
    expect(compte()).toBe('Moussa#sans-jeton');

    statutMe = 401;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'relire' }));
    });
    await waitFor(() =>
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }),
    );
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('un compte déjà posé n’est pas remplacé sous impersonation (TCK-2158)', () => {
    monter(awa, true);
    expect(compte()).toBe('Awa#sans-jeton');
  });
});
