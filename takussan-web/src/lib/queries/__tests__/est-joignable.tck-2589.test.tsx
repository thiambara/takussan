/**
 * TCK-2589 — « Écrire » de la fiche client : `useEstJoignable` demande au SERVEUR si ce compte
 * accepterait une directe (`filter[id]` de `GET /api/conversations/contacts`, la règle de
 * `StoreConversationRequest`), et ne dit « oui » que si la réponse le nomme.
 */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useEstJoignable } from '../conversations';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1 } }),
}));
vi.mock('next-intl', () => ({ useLocale: () => 'fr' }));

function espionFetch(data: readonly { id: number }[]) {
  const espion = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
    ok: true,
    status: 200,
    json: async () => ({ data, meta: { total: data.length, current_page: 1, last_page: 1, per_page: 1 } }),
    text: async () => '{}',
  }));
  vi.stubGlobal('fetch', espion);
  return espion;
}

function enveloppe({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useEstJoignable', () => {
  it('demande ce compte seul, en sparse fieldset, et dit oui quand le serveur le nomme', async () => {
    const espion = espionFetch([{ id: 42 }]);
    const { result } = renderHook(() => useEstJoignable(42), { wrapper: enveloppe });
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    const url = new URL(String(espion.mock.calls[0]?.[0]), 'http://x');
    expect(url.pathname).toMatch(/\/api\/conversations\/contacts$/);
    expect(url.searchParams.get('filter[id]')).toBe('42');
    expect(url.searchParams.get('fields[users]')).toBe('id');
  });

  it('le serveur ne le nomme pas : non', async () => {
    const espion = espionFetch([]);
    const { result } = renderHook(() => useEstJoignable(42), { wrapper: enveloppe });
    await waitFor(() => expect(espion).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
  });

  it('une autre personne dans la réponse ne vaut pas oui', async () => {
    espionFetch([{ id: 7 }]);
    const { result } = renderHook(() => useEstJoignable(42), { wrapper: enveloppe });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current).toBe(false);
  });

  it('sans compte : aucune requête, non', async () => {
    const espion = espionFetch([{ id: 42 }]);
    const { result } = renderHook(() => useEstJoignable(null), { wrapper: enveloppe });
    await new Promise((r) => setTimeout(r, 20));
    expect(espion).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});
