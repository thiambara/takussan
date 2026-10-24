/**
 * TCK-1768 (P136.01) — la pastille des messages non lus se nourrit d'une lecture étroite.
 *
 * Mesuré le 2026-10-23 : `useUnreadCount` lisait la liste de la messagerie elle-même
 * (`include=property,participants,last_message`, `per_page=30`) toutes les 10 s, sur toute page
 * connectée, pour n'en garder que `meta.unread_total`. Décision du porteur : hors de
 * `/app/messages`, une lecture étroite (`per_page=1`, sans `include`) à une cadence plus lente ;
 * la liste complète garde ses 10 s dans la seule messagerie.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ chemin: '/app' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.chemin }));
vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useLocale: () => 'fr',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton' }) }));

const api = vi.hoisted(() => ({ requete: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: api.requete,
}));

import { useUnreadCount } from '../useUnreadCount';
import { NonLusQueryKeys } from '@/lib/queries/conversations-list';

let client: QueryClient;
function Enveloppe({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const cadence = () =>
  client.getQueryCache().find({ queryKey: NonLusQueryKeys.total })?.observers[0]?.options.refetchInterval;

describe('useUnreadCount — lecture étroite (TCK-1768)', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.requete.mockReset().mockResolvedValue({
      data: [],
      meta: { total: 9, per_page: 1, current_page: 1, last_page: 9, unread_total: 4 },
    });
  });
  afterEach(() => client.clear());

  it('hors de la messagerie : une ligne, sans include, toutes les 30 s', async () => {
    nav.chemin = '/app/properties';
    const { result } = renderHook(() => useUnreadCount(), { wrapper: Enveloppe });

    await waitFor(() => expect(result.current).toBe(4));
    const url = String(api.requete.mock.calls[0][0]);
    expect(url).toContain('/api/conversations');
    expect(url).toContain('per_page=1');
    expect(url).not.toContain('include');
    expect(url).not.toContain('participants');
    expect(url).not.toContain('last_message');
    expect(cadence()).toBe(30_000);
  });

  it('dans la messagerie : la même lecture étroite, à 10 s', async () => {
    nav.chemin = '/app/messages';
    const { result } = renderHook(() => useUnreadCount(), { wrapper: Enveloppe });

    await waitFor(() => expect(result.current).toBe(4));
    expect(String(api.requete.mock.calls[0][0])).not.toContain('include');
    expect(cadence()).toBe(10_000);
  });

  it('un fil marqué lu (invalidation de la liste) relit la pastille sans attendre son tour', async () => {
    nav.chemin = '/app/properties';
    const { result } = renderHook(() => useUnreadCount(), { wrapper: Enveloppe });
    await waitFor(() => expect(result.current).toBe(4));

    api.requete.mockResolvedValue({
      data: [],
      meta: { total: 9, per_page: 1, current_page: 1, last_page: 9, unread_total: 1 },
    });
    await client.invalidateQueries({ queryKey: ['conversations', 'list'] });

    await waitFor(() => expect(result.current).toBe(1));
  });

  it('désactivée : aucune lecture', async () => {
    nav.chemin = '/app';
    const { result } = renderHook(() => useUnreadCount({ enabled: false }), { wrapper: Enveloppe });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(0);
    expect(api.requete).not.toHaveBeenCalled();
  });
});
