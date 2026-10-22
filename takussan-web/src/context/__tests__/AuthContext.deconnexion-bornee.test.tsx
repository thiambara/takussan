/**
 * TCK-1481 (P113.05) — la déconnexion vide la session du navigateur même quand le relais ne
 * répond pas.
 *
 * Mesuré le 2026-10-22 : `AuthProvider`, `fetch` de déconnexion qui ne se résout jamais → après
 * 1,5 s, `logout()` non résolu et `user` toujours présent ; « Se déconnecter » ne produisait rien
 * de visible. Décision du porteur : attente bornée à quelques secondes, effacement quand même.
 */
import { act, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DELAI_DECONNEXION_MS } from '@/lib/delais-deconnexion';
import { createQueryClient } from '@/lib/query-client';

const A = { id: 7, first_name: 'Astou', last_name: 'Dieng', roles: [] } as unknown as User;

function Sonde() {
  const { user, logout } = useAuth();
  return (
    <>
      <p data-testid="compte">{user ? user.first_name : 'personne'}</p>
      <button type="button" onClick={() => void logout()}>
        sortir
      </button>
    </>
  );
}

describe('AuthContext.logout — relais figé (TCK-1481)', () => {
  let reseau: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    reseau = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_, rejeter) => {
          init?.signal?.addEventListener('abort', () =>
            rejeter(new DOMException('abandon', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', reseau);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('vide l’état local à l’échéance, sans attendre la révocation', async () => {
    expect(DELAI_DECONNEXION_MS).toBeLessThanOrEqual(10_000);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider initialUser={A} initialToken="jeton-A">
          <Sonde />
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('compte')).toHaveTextContent('Astou');

    await act(async () => {
      screen.getByRole('button', { name: 'sortir' }).click();
    });
    expect(reseau).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_DECONNEXION_MS - 1);
    });
    expect(screen.getByTestId('compte')).toHaveTextContent('Astou');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByTestId('compte')).toHaveTextContent('personne');
  });
});
