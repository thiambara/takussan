/**
 * TCK-642 — `useSoldeCredits` : un nombre sur 200, `null` sur tout le reste (AC2, AC5). Le solde qui
 * suit le changement de profil actif (AC4) est gardé par `useSwitchActiveProfile.lectures-d-agence`
 * depuis TCK-2091 : le hook n'écoute plus le cache des profils.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest,
}));

const { ApiError } = await import('@/lib/api');
const { useSoldeCredits, CLE_SOLDE_CREDITS } = await import('../credits-solde');

function monter(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  const rendu = renderHook(() => useSoldeCredits({ enabled }), { wrapper });
  return { client, ...rendu };
}

const solde = (balance: number) => ({ data: { balance } });

beforeEach(() => {
  apiRequest.mockReset();
});

describe('useSoldeCredits — ce qui s’affiche', () => {
  it('lit `/api/credits/balance` (préfixe `/api` écrit par l’appelant) et rend le solde', async () => {
    apiRequest.mockResolvedValue(solde(12));
    const { result } = monter();
    await waitFor(() => expect(result.current).toBe(12));
    expect(apiRequest.mock.calls[0]?.[0]).toBe('/api/credits/balance');
  });

  it('un solde nul est un solde : 0 sur une réponse 200', async () => {
    apiRequest.mockResolvedValue(solde(0));
    const { result } = monter();
    await waitFor(() => expect(result.current).toBe(0));
  });

  it.each([
    ['403 — le profil actif n’a pas `boost.spend`', new ApiError(403, { message: 'Forbidden' })],
    ['422 — `credits.no_space`', new ApiError(422, { code: 'credits.no_space' })],
    ['panne réseau', new TypeError('Failed to fetch')],
  ])('%s → null, jamais « 0 »', async (_cas, erreur) => {
    apiRequest.mockRejectedValue(erreur);
    const { result, client } = monter();
    await waitFor(() => expect(client.getQueryState([...CLE_SOLDE_CREDITS])?.status).toBe('error'));
    expect(result.current).toBeNull();
  });

  it('pendant le chargement → null', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    const { result } = monter();
    expect(result.current).toBeNull();
  });

  it('désactivé : aucune requête', () => {
    const { result } = monter(false);
    expect(result.current).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
