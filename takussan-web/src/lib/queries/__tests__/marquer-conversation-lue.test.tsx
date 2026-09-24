/**
 * Reprise du 2026-09-24 — `PUT /api/conversations/{id}/read` n'était appelé nulle part : un fil
 * lu sans y répondre restait « non lu » pour toujours. `useMarkConversationRead` le marque lu à
 * l'ouverture et à chaque message plus récent, onglet visible, puis rafraîchit la liste.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useMarkConversationRead } from '../conversations';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1 } }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

function espionFetch(ok = true) {
  const espion = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ data: {} }),
    text: async () => '{}',
  }));
  vi.stubGlobal('fetch', espion);
  return espion;
}

function monter(initial: { id: number | null; dernier: number | null; visible?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalider = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendu = renderHook(
    (p: { id: number | null; dernier: number | null; visible?: boolean }) =>
      useMarkConversationRead(p.id, p.dernier, { enabled: p.visible ?? true }),
    { wrapper, initialProps: initial },
  );
  return { ...rendu, invalider };
}

const appelsRead = (espion: ReturnType<typeof espionFetch>) =>
  espion.mock.calls.filter(([url]) => String(url).endsWith('/read'));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMarkConversationRead', () => {
  it('marque le fil lu à l’ouverture, puis rafraîchit la liste', async () => {
    const espion = espionFetch();
    const { invalider } = monter({ id: 42, dernier: 7 });

    await waitFor(() => expect(appelsRead(espion)).toHaveLength(1));
    const [url, init] = appelsRead(espion)[0]!;
    expect(String(url)).toMatch(/\/api\/conversations\/42\/read$/);
    expect((init as RequestInit).method).toBe('PUT');
    await waitFor(() =>
      expect(invalider).toHaveBeenCalledWith({ queryKey: ['conversations', 'list'] }),
    );
  });

  it('un appel par message plus récent, aucun en double', async () => {
    const espion = espionFetch();
    const { rerender } = monter({ id: 42, dernier: 7 });
    await waitFor(() => expect(appelsRead(espion)).toHaveLength(1));

    rerender({ id: 42, dernier: 7 });
    rerender({ id: 42, dernier: 8 });
    await waitFor(() => expect(appelsRead(espion)).toHaveLength(2));
  });

  it('rien tant que l’onglet est caché ou que le fil est vide', async () => {
    const espion = espionFetch();
    const { rerender } = monter({ id: 42, dernier: 7, visible: false });
    rerender({ id: 42, dernier: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(appelsRead(espion)).toHaveLength(0);

    rerender({ id: 42, dernier: 7, visible: true });
    await waitFor(() => expect(appelsRead(espion)).toHaveLength(1));
  });
});
