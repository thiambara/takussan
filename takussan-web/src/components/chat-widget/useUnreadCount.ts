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
 *
 * TCK-377 — `enabled` : la barre latérale de `/app` lit ce compteur pour la pastille de
 * « Messagerie », et ne doit armer AUCUN sondage quand l'entrée n'est pas rendue. Le défaut
 * reste `true` — `ChatWidget`, monté globalement, appelle ce hook sans argument et sonde déjà
 * `/api/conversations` toutes les 10 s. La clé de requête étant la même, la barre latérale ne
 * coûte aucune requête supplémentaire : elle lit le cache que le widget alimente.
 */
export function useUnreadCount(options: { enabled?: boolean } = {}): number {
  const enabled = options.enabled ?? true;
  const { user } = useAuth();
  const { data, isLoading } = useConversations({}, { enabled });

  return useMemo(() => {
    if (!enabled || isLoading || !data?.data || !user) return 0;
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
  }, [data, enabled, isLoading, user]);
}
