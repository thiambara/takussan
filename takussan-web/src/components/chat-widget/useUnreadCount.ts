'use client';

import { useConversations } from '@/lib/queries/conversations-list';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-274 — The global unread badge value, read from the conversation list
 * already cached by `useConversations`. No extra endpoint, no extra polling
 * — the existing 10 s list refetch is the source of truth.
 *
 * Rules:
 *   - `meta.unread_total`, counted by the API over the WHOLE list (TCK-1387),
 *     muted conversations excluded (they still ring on the page but should
 *     not pull attention from the floating badge)
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

  // TCK-1387 (P135.02) — le total vient de l'API (`meta.unread_total`), compté sur toute la liste
  // hors fils en sourdine : additionner les `unread_count` de la page ignorait les fils au-delà
  // des 30 premiers.
  if (!enabled || isLoading || !user) return 0;
  return data?.meta?.unread_total ?? 0;
}
