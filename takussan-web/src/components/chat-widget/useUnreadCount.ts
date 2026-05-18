'use client';

import { useMemo } from 'react';
import { useConversations } from '@/lib/queries/conversations';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-274 — Derive the global unread badge value from the conversation list
 * already cached by `useConversations`. No extra endpoint, no extra polling
 * — the existing 10 s list refetch is the source of truth.
 *
 * Rules:
 *   - sum `unread_count` over conversations the current user actively
 *     participates in (`left_at = null`)
 *   - drop conversations the user has muted (those still ring on the page
 *     but should not pull attention from the floating badge)
 *   - return 0 while loading or for anonymous visitors
 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const { data, isLoading } = useConversations();

  return useMemo(() => {
    if (isLoading || !data?.data || !user) return 0;
    return data.data.reduce((sum, conversation) => {
      const unread = conversation.unread_count ?? 0;
      if (unread <= 0) return sum;

      const myParticipant = conversation.participants?.find(
        (p) => p.user_id === user.id && !p.left_at,
      );
      if (!myParticipant) return sum;
      if (myParticipant.is_muted) return sum;

      return sum + unread;
    }, 0);
  }, [data, isLoading, user]);
}
