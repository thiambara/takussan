import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSwitchActiveProfile } from '../useProfiles';
import { withIntl } from '@/test/intl';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, refreshUser: vi.fn(async () => undefined), setActiveProfileId: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

/**
 * TCK-1899 (P197.01) — l'abonnement et les reversements plateforme passent par les relais
 * `/api/me/subscription` et `/api/me/payouts`, qui posent l'indice du profil actif : leur
 * réponse change avec le profil. Un changement de profil réussi doit donc les rendre périmées,
 * sinon l'agence quittée reste affichée jusqu'à cinq minutes (`staleTime`).
 */
describe('useSwitchActiveProfile — lectures portées par le profil actif', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function monter(statut: number) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['me', 'subscription'], { data: { plan: 'A' } });
    queryClient.setQueryData(['me', 'payouts'], { data: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { id: 'p2' } }), { status: statut })),
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
    const { result } = renderHook(() => useSwitchActiveProfile(), { wrapper });
    return { queryClient, result };
  }

  it('invalide l’abonnement et les reversements après un changement réussi', async () => {
    const { queryClient, result } = monter(200);

    result.current.mutate('p2');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => {
      expect(queryClient.getQueryState(['me', 'subscription'])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(['me', 'payouts'])?.isInvalidated).toBe(true);
    });
  });
});
