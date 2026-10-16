/**
 * TCK-642 — `useSoldeCredits` : un nombre sur 200, `null` sur tout le reste (AC2, AC5), et un
 * solde qui suit le changement de profil actif (AC4).
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest,
}));

const { ApiError } = await import('@/lib/api');
const { useSoldeCredits, CLE_SOLDE_CREDITS, CLE_PROFILS_ECOUTEE } = await import('../credits-solde');
const { profilesKeys } = await import('@/hooks/useProfiles');

function monter(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  const rendu = renderHook(() => useSoldeCredits({ enabled }), { wrapper });
  return { client, ...rendu };
}

const solde = (balance: number) => ({ data: { balance } });
const profils = (actif: string) => ({ data: [], meta: { active_profile_id: actif } });

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

describe('useSoldeCredits — le solde suit le profil actif (AC4)', () => {
  it('la clé écoutée est celle du cache des profils (recopiée pour la frontière i18n publique)', () => {
    expect(CLE_PROFILS_ECOUTEE).toEqual(profilesKeys.all);
  });

  it('relit après un changement CONFIRMÉ par le serveur, pas sur l’écriture optimiste', async () => {
    apiRequest.mockResolvedValueOnce(solde(5));
    const { result, client } = monter();
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:1') }));
    await waitFor(() => expect(result.current).toBe(5));

    // Le sélecteur bascule l'identifiant AVANT le `PATCH` : rien ne doit être relu là.
    act(() => {
      client.setQueryData(profilesKeys.all, profils('agency_admin:2'));
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);

    // Le `PATCH` abouti, les profils sont relus : le serveur confirme le nouvel espace.
    apiRequest.mockResolvedValueOnce(solde(40));
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:2') }));
    await waitFor(() => expect(result.current).toBe(40));
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('pendant la relecture du nouvel espace, le solde de l’ancien n’est PLUS affiché', async () => {
    apiRequest.mockResolvedValueOnce(solde(5));
    const { result, client } = monter();
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:1') }));
    await waitFor(() => expect(result.current).toBe(5));
    apiRequest.mockReturnValueOnce(new Promise(() => {}));
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:2'), staleTime: 0 }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(result.current).toBeNull();
  });

  it('une relecture des profils SANS changement d’espace ne relit pas le solde', async () => {
    apiRequest.mockResolvedValue(solde(5));
    const { result, client } = monter();
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:1') }));
    await waitFor(() => expect(result.current).toBe(5));
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:1'), staleTime: 0 }));
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('le nouvel espace refuse le portefeuille : le solde de l’ancien n’est PAS gardé', async () => {
    apiRequest.mockResolvedValueOnce(solde(5));
    const { result, client } = monter();
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('agency_admin:1') }));
    await waitFor(() => expect(result.current).toBe(5));
    apiRequest.mockRejectedValueOnce(new ApiError(403, {}));
    await act(() => client.fetchQuery({ queryKey: profilesKeys.all, queryFn: async () => profils('owner:3'), staleTime: 0 }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current).toBeNull());
  });
});
