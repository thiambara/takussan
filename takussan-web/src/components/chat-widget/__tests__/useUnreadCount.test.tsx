/**
 * TCK-274 — Floating chat widget.
 *
 * `useUnreadCount` reads the global unread badge from the cached conversation
 * list (no extra endpoint). Cap is `9+` for display, but the hook returns the
 * raw integer — formatting lives in the badge component.
 *
 * TCK-1387 (P135.02) — the value is `meta.unread_total`, counted by the API
 * over the WHOLE list (muted conversations excluded, server side), and no
 * longer the sum of `unread_count` over the first page.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUnreadCount } from '../useUnreadCount';
import type { Conversation } from '@/types/message';

type ListShape = { data: Conversation[]; meta?: { unread_total?: number } };

const useConversationsMock = vi.fn<() => { data: ListShape | undefined; isLoading: boolean }>();

// TCK-1768 — la pastille passe par sa lecture étroite, `useNonLusTotal`.
vi.mock('@/lib/queries/conversations-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/conversations-list')>()),
  useNonLusTotal: (...args: unknown[]) => useConversationsMock(...(args as [])),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function mkConv(overrides: Partial<Conversation>): Conversation {
  return {
    id: 1,
    subject: null,
    property_id: null,
    lease_id: null,
    maintenance_request_id: null,
    type: 'direct',
    status: 'active',
    created_by: 1,
    last_message_at: null,
    last_message_preview: null,
    created_at: '2026-05-13T10:00:00Z',
    updated_at: '2026-05-13T10:00:00Z',
    unread_count: 0,
    participants: [
      {
        id: 11,
        user_id: 1,
        role: 'member',
        is_muted: false,
        last_read_at: null,
        joined_at: '2026-05-13T10:00:00Z',
        left_at: null,
      },
    ],
    ...overrides,
  };
}

describe('useUnreadCount', () => {
  it('returns 0 when there are no conversations', () => {
    useConversationsMock.mockReturnValue({ data: { data: [], meta: { unread_total: 0 } }, isLoading: false });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(0);
  });

  it('lit le total de l’API, et non la somme de la page (TCK-1387)', () => {
    // La page ne porte aucun non-lu : le seul est dans un fil hors des 30 premiers.
    useConversationsMock.mockReturnValue({
      data: {
        data: [mkConv({ id: 1, unread_count: 0 }), mkConv({ id: 2, unread_count: 0 })],
        meta: { unread_total: 4 },
      },
      isLoading: false,
    });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(4);
  });

  it('n’additionne plus la page : la sourdine est jugée par l’API', () => {
    useConversationsMock.mockReturnValue({
      data: {
        data: [mkConv({ id: 1, unread_count: 3 }), mkConv({ id: 2, unread_count: 99 })],
        meta: { unread_total: 3 },
      },
      isLoading: false,
    });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(3);
  });

  it('returns 0 while the query is loading', () => {
    useConversationsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(0);
  });

  it('returns 0 when disabled', () => {
    useConversationsMock.mockReturnValue({ data: { data: [], meta: { unread_total: 5 } }, isLoading: false });
    const { result } = renderHook(() => useUnreadCount({ enabled: false }), {
      wrapper: ({ children }) => wrap(children),
    });
    expect(result.current).toBe(0);
  });
});
