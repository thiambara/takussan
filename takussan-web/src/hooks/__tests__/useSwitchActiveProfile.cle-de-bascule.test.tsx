/**
 * TCK-2482 (revue M3) — la bascule d'espace porte une CLÉ de mutation partagée
 * (`CLE_DE_BASCULE_D_ESPACE`) : toute surface qui propose une bascule (la palette de commandes) voit,
 * par `useIsMutating`, une bascule lancée ailleurs (le sélecteur d'espace), au lieu de n'en voir que la
 * sienne (`isPending` d'une instance montée après coup est toujours `false`).
 */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useIsMutating } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { CLE_DE_BASCULE_D_ESPACE } from '@/lib/cache-d-espace';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

const { useSwitchActiveProfile } = await import('@/hooks/useProfiles');

beforeEach(() => {
  // Le `PATCH` ne répond jamais : la bascule reste EN COURS le temps du test.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
});
afterEach(() => vi.restoreAllMocks());

describe('useSwitchActiveProfile — clé de mutation partagée (revue M3)', () => {
  it('une bascule en cours se voit par useIsMutating sur CLE_DE_BASCULE_D_ESPACE, depuis un autre crochet', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    const { result } = renderHook(
      () => ({ bascule: useSwitchActiveProfile(), enCours: useIsMutating({ mutationKey: CLE_DE_BASCULE_D_ESPACE }) }),
      { wrapper },
    );
    expect(result.current.enCours).toBe(0);
    act(() => result.current.bascule.mutate('owner:7'));
    await waitFor(() => expect(result.current.enCours).toBe(1));
  });
});
