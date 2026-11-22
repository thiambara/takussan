/**
 * TCK-2968 — la pastille de l'onglet Messages lit `meta.gestes` (les fils qui attendent un geste), pas
 * `unread_total` : un fil lu peut rester « À vous ». Le widget flottant garde `unread_total` (défaut).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnreadCount } from '../useUnreadCount';

const lecture = vi.fn<() => { data: unknown; isLoading: boolean; isError?: boolean }>();
vi.mock('@/lib/queries/conversations-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/conversations-list')>()),
  useNonLusTotal: () => lecture(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));

describe('useUnreadCount — la mesure des gestes (TCK-2968)', () => {
  it('`mesure: gestes` lit `meta.gestes` ; le défaut lit `unread_total`', () => {
    lecture.mockReturnValue({ data: { data: [], meta: { unread_total: 7, gestes: 3 } }, isLoading: false });
    expect(renderHook(() => useUnreadCount({ mesure: 'gestes' })).result.current).toBe(3);
    expect(renderHook(() => useUnreadCount()).result.current).toBe(7);
  });

  it('0 en chargement, en erreur, ou quand l’API ne rend pas encore `gestes`', () => {
    lecture.mockReturnValue({ data: undefined, isLoading: true });
    expect(renderHook(() => useUnreadCount({ mesure: 'gestes' })).result.current).toBe(0);
    lecture.mockReturnValue({ data: { data: [], meta: { gestes: 3 } }, isLoading: false, isError: true });
    expect(renderHook(() => useUnreadCount({ mesure: 'gestes' })).result.current).toBe(0);
    lecture.mockReturnValue({ data: { data: [], meta: { unread_total: 7 } }, isLoading: false });
    expect(renderHook(() => useUnreadCount({ mesure: 'gestes' })).result.current).toBe(0);
  });
});
