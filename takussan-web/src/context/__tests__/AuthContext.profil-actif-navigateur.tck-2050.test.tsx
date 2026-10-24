/**
 * TCK-2050 (P174.01) — les appels du navigateur à l'API portent l'indice du profil actif.
 *
 * L'API est sur une autre origine que le front : le cookie `active_profile_id`, `httpOnly` et posé
 * sur l'hôte du front, ne l'atteint jamais depuis le navigateur. Sans indice, l'API n'auto-bascule
 * que pour un compte d'une seule agence : pour un compte de deux agences, chaque lecture du
 * navigateur partait sans profil (listes vides, fiches en 403, indicateurs refusés).
 *
 * Décision du porteur : le navigateur tient le profil actif du layout racine
 * (`initialActiveProfileId`, comme `initialToken`), mis à jour par `useSwitchActiveProfile` ;
 * tout appel authentifié porte l'indice.
 */
import type { ReactNode } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { useApiQuery } = await import('@/hooks/useApiQuery');
const { useSwitchActiveProfile } = await import('@/hooks/useProfiles');
const { apiRequest } = await import('@/lib/api');

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (entree) => {
    const url = String(entree);
    if (url.includes('/api/me/active-profile')) {
      return new Response(JSON.stringify({ data: { id: 'agent:9' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function monter(props: { token: string | null; profil: string | null }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AuthProvider
          initialUser={props.token ? ({ id: 1 } as never) : null}
          initialToken={props.token}
          initialActiveProfileId={props.profil}
        >
          {children}
        </AuthProvider>
      </QueryClientProvider>,
    );
  return wrapper;
}

/** L'indice du dernier appel parti vers l'API (hors relais du front). */
function indiceDuDernierAppelApi(): string | undefined {
  const appels = fetchSpy.mock.calls.filter(([entree]) => !String(entree).startsWith('/'));
  const init = appels.at(-1)?.[1] as RequestInit | undefined;
  return ((init?.headers ?? {}) as Record<string, string>)['X-Active-Profile-Hint'];
}

describe('le navigateur porte le profil actif du layout racine', () => {
  it('une lecture de useApiQuery porte l’indice du profil reçu du layout', async () => {
    const wrapper = monter({ token: 'jeton', profil: 'agent:7' });

    const { result } = renderHook(() => useApiQuery(['biens'], '/api/properties'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(indiceDuDernierAppelApi()).toBe('agent:7');
  });

  it('après useSwitchActiveProfile, les appels portent le profil choisi', async () => {
    const wrapper = monter({ token: 'jeton', profil: 'agent:7' });

    const { result } = renderHook(() => ({ basculer: useSwitchActiveProfile(), auth: useAuth() }), {
      wrapper,
    });

    await act(async () => {
      await result.current.basculer.mutateAsync('agent:9');
    });
    await apiRequest('/api/customers', { token: 'jeton' });

    expect(indiceDuDernierAppelApi()).toBe('agent:9');
    expect(result.current.auth.activeProfileId).toBe('agent:9');
  });

  it('un appel qui nomme son profil l’emporte', async () => {
    renderHook(() => useAuth(), { wrapper: monter({ token: 'jeton', profil: 'agent:7' }) });

    await apiRequest('/api/customers', { token: 'jeton', activeProfileId: 'owner:3' });

    expect(indiceDuDernierAppelApi()).toBe('owner:3');
  });

  it('un appel sans jeton ne porte aucun indice', async () => {
    renderHook(() => useAuth(), { wrapper: monter({ token: 'jeton', profil: 'agent:7' }) });

    await apiRequest('/api/public/properties');

    expect(indiceDuDernierAppelApi()).toBeUndefined();
  });

  it('la déconnexion oublie le profil actif', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: monter({ token: 'jeton', profil: 'agent:7' }),
    });

    await act(async () => {
      await result.current.logout();
    });
    await apiRequest('/api/customers', { token: 'autre' });

    expect(indiceDuDernierAppelApi()).toBeUndefined();
  });

  it('un nouveau rendu du layout (router.refresh, action d’accueil) fait foi', async () => {
    const queryClient = new QueryClient();
    const arbre = (profil: string) =>
      withIntl(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialUser={{ id: 1 } as never} initialToken="jeton" initialActiveProfileId={profil}>
            <span />
          </AuthProvider>
        </QueryClientProvider>,
      );
    const { rerender } = render(arbre('agent:7'));

    rerender(arbre('owner:4'));
    await apiRequest('/api/customers', { token: 'jeton' });

    expect(indiceDuDernierAppelApi()).toBe('owner:4');
  });
});
