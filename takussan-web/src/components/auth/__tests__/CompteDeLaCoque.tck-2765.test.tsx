/**
 * TCK-2765 (AC2, AC3) — ce que `<CompteDeLaCoque>` ne pose jamais.
 *
 * Il pose le compte de la coque UNE fois, au montage, quand `AuthContext` n'en a aucun sous un
 * jeton présent. Il ne rouvre donc ni une session fermée (`logout`, 401 de `refreshUser`), ni ne
 * remplace un compte déjà posé (TCK-2158).
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
  const { user, token, logout, refreshUser } = useAuth();
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
    </>
  );
}

function monter(initialUser: User | null, initialToken: string | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider initialUser={initialUser} initialToken={initialToken}>
        <CompteDeLaCoque utilisateur={agent} />
        <Lecteur />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const compte = () => screen.getByTestId('compte').textContent;

describe('<CompteDeLaCoque> (TCK-2765)', () => {
  it('sans compte sous un jeton : pose le compte de la coque', () => {
    monter(null, 'jeton');
    expect(compte()).toBe('Moussa#jeton');
  });

  it('AC2 — sans jeton, rien ne se pose', () => {
    monter(null, null);
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('AC2 — une déconnexion n’est pas annulée par la coque', async () => {
    monter(null, 'jeton');
    expect(compte()).toBe('Moussa#jeton');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'sortir' }));
    });
    await waitFor(() => expect(compte()).toBe('aucun#sans-jeton'));
  });

  it('un 401 de `refreshUser` sous le jeton encore présent n’est pas annulé par la coque', async () => {
    monter(null, 'jeton');
    expect(compte()).toBe('Moussa#jeton');

    statutMe = 401;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'relire' }));
    });
    // Le 401 a bien été lu : `refreshUser` relaie la fermeture à `/api/auth/logout`.
    await waitFor(() =>
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }),
    );
    expect(compte()).toBe('aucun#jeton');
  });

  it('AC3 — un compte déjà posé n’est pas remplacé par celui de la coque', () => {
    monter(awa, 'jeton');
    expect(compte()).toBe('Awa#jeton');
  });
});
