/**
 * TCK-274 — Floating chat widget.
 *
 * `useUnreadCount` derives the global unread badge from the cached
 * conversation list (no extra endpoint). Only conversations the current user
 * has *not muted* contribute. Cap is `9+` for display, but the hook returns
 * the raw integer — formatting lives in the badge component.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUnreadCount } from '../useUnreadCount';
import type { Conversation } from '@/types/message';

type ListShape = { data: Conversation[] };

const useConversationsMock = vi.fn<() => { data: ListShape | undefined; isLoading: boolean }>();

vi.mock('@/lib/queries/conversations', () => ({
  useConversations: (...args: unknown[]) => useConversationsMock(...(args as [])),
}));

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
    useConversationsMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(0);
  });

  it('sums unread_count across conversations', () => {
    useConversationsMock.mockReturnValue({
      data: {
        data: [
          mkConv({ id: 1, unread_count: 3 }),
          mkConv({ id: 2, unread_count: 5 }),
          mkConv({ id: 3, unread_count: 0 }),
        ],
      },
      isLoading: false,
    });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(8);
  });

  it('ignores muted conversations for the current user', () => {
    useConversationsMock.mockReturnValue({
      data: {
        data: [
          mkConv({ id: 1, unread_count: 3 }),
          mkConv({
            id: 2,
            unread_count: 99,
            participants: [
              {
                id: 22,
                user_id: 1,
                role: 'member',
                is_muted: true,
                last_read_at: null,
                joined_at: '2026-05-13T10:00:00Z',
                left_at: null,
              },
            ],
          }),
        ],
      },
      isLoading: false,
    });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(3);
  });

  it('ignores conversations the user has left', () => {
    useConversationsMock.mockReturnValue({
      data: {
        data: [
          mkConv({ id: 1, unread_count: 4 }),
          mkConv({
            id: 2,
            unread_count: 7,
            participants: [
              {
                id: 33,
                user_id: 1,
                role: 'member',
                is_muted: false,
                last_read_at: null,
                joined_at: '2026-05-13T10:00:00Z',
                left_at: '2026-05-13T11:00:00Z',
              },
            ],
          }),
        ],
      },
      isLoading: false,
    });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(4);
  });

  it('returns 0 while the query is loading', () => {
    useConversationsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: ({ children }) => wrap(children) });
    expect(result.current).toBe(0);
  });
});
