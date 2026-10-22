import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError, apiRequest } from '@/lib/api';
import { useApiMutation } from '../useApiQuery';

/**
 * TCK-1396 (P144.01, ADR-0072 § 7) — l'option `idempotence` de `useApiMutation` : la clé naît au
 * montage, reste la même après un échec, est neuve après un succès et après `idempotency.key_reused`.
 */
vi.mock('next-intl', () => ({ useLocale: () => 'fr' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: null }) }));
vi.mock('@/components/auth/garde-double-facteur-contexte', () => ({ useGardeDoubleFacteur: () => null }));
vi.mock('@/lib/double-facteur', () => ({ avecGardeDoubleFacteur: (envoi: () => unknown) => envoi() }));
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return { ...reel, apiRequest: vi.fn() };
});

const envoi = vi.mocked(apiRequest);

function enveloppe({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function cleDe(appel: number): string | undefined {
  const options = envoi.mock.calls[appel]?.[1] as { headers?: Record<string, string> } | undefined;
  return options?.headers?.['Idempotency-Key'];
}

async function envoyer(hook: { current: ReturnType<typeof useApiMutation<unknown, { a: number }>> }) {
  await act(async () => {
    await hook.current.mutateAsync({ a: 1 }).catch(() => undefined);
  });
}

describe('useApiMutation — option idempotence (TCK-1396)', () => {
  beforeEach(() => envoi.mockReset());

  it('garde la même clé après un échec, et en prend une neuve après un succès', async () => {
    envoi
      .mockRejectedValueOnce(new ApiError(502, null))
      .mockRejectedValueOnce(new ApiError(422, { message: 'x', errors: { a: ['requis'] } }))
      .mockResolvedValueOnce({ data: 1 })
      .mockResolvedValueOnce({ data: 2 });
    const { result } = renderHook(
      () => useApiMutation<unknown, { a: number }>({ path: '/api/x' }, { idempotence: true }),
      { wrapper: enveloppe },
    );

    await envoyer(result);
    await envoyer(result);
    await envoyer(result);
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(3));
    await envoyer(result);

    expect(cleDe(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(cleDe(1)).toBe(cleDe(0));
    expect(cleDe(2)).toBe(cleDe(0));
    expect(cleDe(3)).toMatch(/^[0-9a-f-]{36}$/);
    expect(cleDe(3)).not.toBe(cleDe(0));
  });

  it('prend une clé neuve après idempotency.key_reused', async () => {
    envoi
      .mockRejectedValueOnce(new ApiError(422, { code: 'idempotency.key_reused', message: 'x' }))
      .mockResolvedValueOnce({ data: 1 });
    const { result } = renderHook(
      () => useApiMutation<unknown, { a: number }>({ path: '/api/x' }, { idempotence: true }),
      { wrapper: enveloppe },
    );

    await envoyer(result);
    await envoyer(result);

    expect(cleDe(1)).toBeDefined();
    expect(cleDe(1)).not.toBe(cleDe(0));
  });

  it('rend le moyen de renouveler la clé à la main', async () => {
    envoi.mockRejectedValueOnce(new ApiError(502, null)).mockResolvedValueOnce({ data: 1 });
    const { result } = renderHook(
      () => useApiMutation<unknown, { a: number }>({ path: '/api/x' }, { idempotence: true }),
      { wrapper: enveloppe },
    );

    await envoyer(result);
    act(() => result.current.renouvelerCleIdempotence());
    await envoyer(result);

    expect(cleDe(1)).toBeDefined();
    expect(cleDe(1)).not.toBe(cleDe(0));
  });

  it('laisse l’en-tête posé par l’appelant l’emporter, et n’envoie rien sans l’option', async () => {
    envoi.mockResolvedValue({ data: 1 });
    const avec = renderHook(
      () =>
        useApiMutation<unknown, { a: number }>(
          { path: '/api/x' },
          { idempotence: true, request: { headers: { 'Idempotency-Key': 'cle-de-l-appelant' } } },
        ),
      { wrapper: enveloppe },
    );
    await envoyer(avec.result);
    const sans = renderHook(() => useApiMutation<unknown, { a: number }>({ path: '/api/x' }), { wrapper: enveloppe });
    await envoyer(sans.result);

    expect(cleDe(0)).toBe('cle-de-l-appelant');
    expect(cleDe(1)).toBeUndefined();
  });
});
