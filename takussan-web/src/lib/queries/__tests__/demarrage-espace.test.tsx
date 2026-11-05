/**
 * TCK-2479 (AC5) — `useDemarrageDeLEspace` : `GET /api/me/espace/demarrage` (préfixe `/api` écrit par
 * l'appelant), aucune lecture sans jeton ni désactivé, et une relecture à la NAVIGATION quand la
 * lecture a plus de 30 s — c'est ce qui fait disparaître une étape faite sur sa page au retour dans le
 * menu, que la barre (montée par le layout) ne remonte pas.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest,
}));
const etat = vi.hoisted(() => ({ chemin: '/app', jeton: 'jeton' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => etat.chemin }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: etat.jeton }) }));

const { useDemarrageDeLEspace, CLE_DEMARRAGE } = await import('../demarrage-espace');

const REPONSE = { data: { etapes: [{ code: 'kyc', faite: false }] } };

function monter(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  const rendu = renderHook((props: { enabled: boolean }) => useDemarrageDeLEspace(props), {
    wrapper,
    initialProps: { enabled },
  });
  return { client, ...rendu };
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue(REPONSE);
  etat.chemin = '/app';
  etat.jeton = 'jeton';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDemarrageDeLEspace — TCK-2479', () => {
  it('lit `/api/me/espace/demarrage` sous sa clé, et rend la réponse', async () => {
    const { result, client } = monter();
    await waitFor(() => expect(result.current.data).toEqual(REPONSE));
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest.mock.calls[0]?.[0]).toBe('/api/me/espace/demarrage');
    expect(client.getQueryData([...CLE_DEMARRAGE])).toEqual(REPONSE);
  });

  it('désactivé (groupe masqué, persona sans « Démarrer ») : aucune lecture', async () => {
    monter(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('sans jeton : aucune lecture', async () => {
    etat.jeton = null;
    monter();
    await new Promise((r) => setTimeout(r, 0));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('une erreur ne se relit pas en boucle (retry: false)', async () => {
    apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new QueryClient(); // retry par défaut : le hook doit le couper lui-même
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    const { result } = renderHook(() => useDemarrageDeLEspace({ enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiRequest).toHaveBeenCalledOnce();
  });

  it('se relit à la navigation quand la lecture a plus de 30 s, pas avant', async () => {
    const { result, rerender } = monter();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequest).toHaveBeenCalledOnce();

    // Navigation dans les 30 s : la lecture est fraîche, rien ne part.
    etat.chemin = '/app/visits';
    rerender({ enabled: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(apiRequest).toHaveBeenCalledOnce();

    // 31 s plus tard, une navigation relit.
    const maintenant = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(maintenant + 31_000);
    etat.chemin = '/app/messages';
    rerender({ enabled: true });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });

  it('deux barres montées (bureau et tiroir) : une navigation, UNE lecture — aucune annulée', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    const useDeuxBarres = () => [useDemarrageDeLEspace({ enabled: true }), useDemarrageDeLEspace({ enabled: true })];
    const { result, rerender } = renderHook(useDeuxBarres, { wrapper });
    await waitFor(() => expect(result.current[0]!.isSuccess).toBe(true));
    expect(apiRequest).toHaveBeenCalledOnce();

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    etat.chemin = '/app/visits';
    rerender();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    // Aucune lecture n'a été annulée en route (`cancelRefetch: false`).
    const signaux = apiRequest.mock.calls.map((c) => (c[1] as { signal: AbortSignal }).signal);
    expect(signaux.map((s) => s.aborted)).toEqual([false, false]);
  });

  it.each([
    ['tout est fait', { data: { etapes: [{ code: 'premier_bien', faite: true }, { code: 'kyc', faite: true }] } }],
    ['aucune étape (`[]`)', { data: { etapes: [] } }],
    ['seule une étape inconnue reste', { data: { etapes: [{ code: 'kyc', faite: true }, { code: 'inconnue', faite: false }] } }],
  ])('revue M2 — %s : plus de relecture, ni à la navigation ni au remontage (tiroir)', async (_cas, reponse) => {
    apiRequest.mockResolvedValue(reponse);
    const { result, rerender, client } = monter();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequest).toHaveBeenCalledOnce();

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    etat.chemin = '/app/messages';
    rerender({ enabled: true });
    // Le tiroir monte le même hook à son ouverture.
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    renderHook(() => useDemarrageDeLEspace({ enabled: true }), { wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(apiRequest).toHaveBeenCalledOnce();
  });

  it('revue M2 — le témoin : une étape restante se relit toujours à la navigation', async () => {
    apiRequest.mockResolvedValue({ data: { etapes: [{ code: 'premier_bien', faite: true }, { code: 'kyc', faite: false }] } });
    const { result, rerender } = monter();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    etat.chemin = '/app/messages';
    rerender({ enabled: true });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });

  it('sans navigation, aucune relecture : pas de sondage', async () => {
    const { result, rerender } = monter();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    rerender({ enabled: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(apiRequest).toHaveBeenCalledOnce();
  });
});
