import type { QueryKey } from '@tanstack/react-query';

/**
 * TCK-2955 — les clés de requête d'un fil, et son sujet temps réel, dans un module SANS hook ni directive :
 * `useFilEnDirect` et `ChatView` les lisent sans tirer `conversations.ts` (que les tests de `ChatView`
 * remplacent en entier). `conversations.ts` les réexporte : ses appelants n'ont rien à changer.
 */

/** Le sujet temps réel d'un fil (`conversation:42`), celui du registre `CanauxTempsReel` de l'API. */
export function sujetDuFil(conversationId: number): string {
  return `conversation:${conversationId}`;
}

/** Le fil, ses participants compris (`useConversation`). */
export function conversationDetailQueryKey(id: number | null | undefined): QueryKey {
  return ['conversations', 'detail', id];
}

/**
 * TCK-2632 — la colonne de contexte d'un fil (TCK-2630) : le bien, le bail, l'intervention, et pour le
 * personnel de l'agence la fiche du client (étape, téléphone, agent). L'en-tête du fil y lit le
 * téléphone : pas de téléphone rendu, pas d'appel ni de WhatsApp.
 */
export function conversationContextQueryKey(id: number | null | undefined): QueryKey {
  return ['conversations', 'context', id];
}

/** Les pages chargées du fil (`useMessagesInfinite`). */
export function messagesInfiniteQueryKey(conversationId: number | null | undefined): QueryKey {
  return ['conversations', conversationId, 'messages-infinite'];
}

/** La relecture `after_id` d'un fil, SANS l'ancre (`useNewMessagesPolling` y ajoute la sienne) : la viser relit les messages neufs. */
export function nouveauxMessagesQueryKey(conversationId: number): QueryKey {
  return ['conversations', conversationId, 'messages', 'live'];
}

/** Les correspondants proposés pour un fil. */
export function contactsDuFilQueryKey(conversationId: number): QueryKey {
  return ['conversations', conversationId, 'contacts'];
}
