/**
 * TCK-2846 (AC4) — la déconnexion efface les récents de la coque (le nom des fiches ouvertes) : après
 * « Se déconnecter », la clé du compte n'existe plus sur l'appareil.
 */
import { act, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { clePagesRecentes, retenirFiche } from '@/lib/navigation/pages-recentes';
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

describe('AuthContext.logout — les récents (TCK-2846)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('AC4 — après la déconnexion, la clé des récents du compte n’existe plus', async () => {
    retenirFiche(7, 'agent:3', { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa 4 chambres à Ngor' });
    expect(window.localStorage.getItem(clePagesRecentes(7))).not.toBeNull();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider initialUser={A} initialToken="jeton-A">
          <Sonde />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'sortir' }).click();
    });
    expect(screen.getByTestId('compte')).toHaveTextContent('personne');
    expect(window.localStorage.getItem(clePagesRecentes(7))).toBeNull();
  });
});
