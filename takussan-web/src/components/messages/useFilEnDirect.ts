'use client';

import { useContext } from 'react';
import { QueryClientContext, type QueryKey } from '@tanstack/react-query';
import {
  contactsDuFilQueryKey,
  conversationContextQueryKey,
  conversationDetailQueryKey,
  messagesInfiniteQueryKey,
  nouveauxMessagesQueryKey,
  sujetDuFil,
} from '@/lib/queries/conversations-cles';
import { useSignal } from '@/lib/temps-reel/hooks';

interface FilEnDirect {
  readonly conversationId: number;
  /** Le fil est vide : la relecture `after_id` n'a pas d'ancre, c'est le fil entier qu'on relit. */
  readonly sansAncre: boolean;
  /** Mon dernier message attend sa coche « Lu » (TCK-2860) : seule une lecture peut la poser. */
  readonly cocheEnAttente: boolean;
}

/**
 * TCK-2955 (ADR-0129 § 2) — le fil ouvert se relit sur les signaux de SON sujet (`conversation:{id}`), et
 * relit seulement ce que le signal dit changé — jamais toutes les pages chargées sans raison :
 *
 * · `message.created` → les messages neufs (`after_id`), fusionnés dans le fil comme par la relecture
 *   périodique : un message apparaît à sa place, et la position de lecture n'est pas volée (`ChatView` ne
 *   descend que si l'on est déjà en bas) ;
 * · `message.updated` → le fil chargé (un message modifié ou supprimé n'est pas « neuf ») ;
 * · `conversation.read` → le fil chargé, mais seulement si une coche est en attente (sinon rien ne change) ;
 * · `participants.updated` → le fil (ses participants), son contexte et ses correspondants ;
 * · la reconnexion (`null`) → tout ce qui précède.
 *
 * Boucle écartée : un message reçu fait marquer le fil lu (`useMarkConversationRead`, un appel par message),
 * dont le `conversation.read` ne relit le fil que si MON dernier message attend sa coche.
 */
export function useFilEnDirect({ conversationId, sansAncre, cocheEnAttente }: FilEnDirect): void {
  // Le contexte, et non `useQueryClient()` qui lève sans fournisseur : `ChatView` se rend aussi sous des
  // harnais sans client de requêtes, où il n'y a de toute façon aucun signal (pas de `TempsReelProvider`).
  const queryClient = useContext(QueryClientContext);
  const relire = (cle: QueryKey) => {
    void queryClient?.invalidateQueries({ queryKey: cle }, { cancelRefetch: false });
  };

  useSignal(sujetDuFil(conversationId), (signal) => {
    const evenement = signal?.event ?? null;
    if (evenement === null || evenement === 'message.created') {
      relire(sansAncre ? messagesInfiniteQueryKey(conversationId) : nouveauxMessagesQueryKey(conversationId));
    }
    if (evenement === 'message.updated' || ((evenement === null || evenement === 'conversation.read') && cocheEnAttente)) {
      relire(messagesInfiniteQueryKey(conversationId));
    }
    if (evenement === null || evenement === 'participants.updated') {
      relire(conversationDetailQueryKey(conversationId));
      relire(conversationContextQueryKey(conversationId));
      relire(contactsDuFilQueryKey(conversationId));
    }
  });
}
