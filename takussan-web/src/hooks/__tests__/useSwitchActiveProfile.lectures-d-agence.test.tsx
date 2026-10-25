import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
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
 * TCK-1899 (P197.01), puis TCK-2091 (P197.05) — un changement de profil CONFIRMÉ par le serveur
 * oublie tout le cache hors `['me','profiles']`, en un seul point (`onSuccess`) : depuis TCK-2050,
 * chaque lecture du navigateur porte le profil actif, et une clé qui ne le porte pas garderait
 * l'agence quittée. Avant, trois écrans réparaient chacun pour soi (solde de crédits, finances,
 * abonnement et reversements), et celui des finances partait sur l'écriture optimiste.
 */
const LECTURES_D_AGENCE: readonly QueryKey[] = [
  ['me', 'subscription'],
  ['me', 'payouts'],
  ['credits', 'solde'],
  ['payments', 'list', { page: 1 }],
  ['property-moderation', 'pending-count'],
  ['leases', 'property-options'],
];
const PROFILS: QueryKey = ['me', 'profiles'];

describe('useSwitchActiveProfile — lectures portées par le profil actif', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function monter(reponse: () => Promise<Response>) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    for (const cle of LECTURES_D_AGENCE) queryClient.setQueryData(cle, { data: 'agence A' });
    queryClient.setQueryData(PROFILS, { data: [], meta: { active_profile_id: 'p1' } });
    vi.stubGlobal('fetch', vi.fn(reponse));
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
    const { result } = renderHook(() => useSwitchActiveProfile(), { wrapper });
    return { queryClient, result };
  }

  const ok = async () => new Response(JSON.stringify({ data: { id: 'p2' } }), { status: 200 });

  it('TCK-2091 — un changement réussi oublie toute lecture en cache, hors les profils', async () => {
    const { queryClient, result } = monter(ok);

    result.current.mutate('p2');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => {
      for (const cle of LECTURES_D_AGENCE) expect(queryClient.getQueryData(cle), JSON.stringify(cle)).toBeUndefined();
    });
    expect(queryClient.getQueryData(PROFILS)).toMatchObject({ meta: { active_profile_id: 'p2' } });
  });

  it('TCK-2091 — rien n’est oublié pendant le PATCH, sur la seule écriture optimiste', async () => {
    let repondre: (r: Response) => void = () => {};
    const { queryClient, result } = monter(() => new Promise<Response>((r) => { repondre = r; }));

    result.current.mutate('p2');

    await waitFor(() =>
      expect(queryClient.getQueryData(PROFILS)).toMatchObject({ meta: { active_profile_id: 'p2' } }),
    );
    for (const cle of LECTURES_D_AGENCE) expect(queryClient.getQueryData(cle)).toEqual({ data: 'agence A' });

    repondre(await ok());
    await waitFor(() => expect(queryClient.getQueryData(['credits', 'solde'])).toBeUndefined());
  });

  it('TCK-2091 — un changement refusé n’oublie rien', async () => {
    const { queryClient, result } = monter(async () => new Response('{}', { status: 500 }));

    result.current.mutate('p2');

    await waitFor(() => expect(result.current.isError).toBe(true));
    for (const cle of LECTURES_D_AGENCE) expect(queryClient.getQueryData(cle)).toEqual({ data: 'agence A' });
  });
});
