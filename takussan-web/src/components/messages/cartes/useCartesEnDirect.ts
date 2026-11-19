'use client';

import { useContext, useEffect, useRef } from 'react';
import { QueryClientContext } from '@tanstack/react-query';

import { messagesInfiniteQueryKey } from '@/lib/queries/conversations-cles';
import type { Message } from '@/types/message';

/** Le plus grand identifiant d'un `event` ou d'une `card` du fil, `null` sans aucun. */
export function dernierMessageDObjet(messages: readonly Message[]): number | null {
  let max: number | null = null;
  for (const m of messages) {
    if ((m.type === 'event' || m.type === 'card') && (max === null || m.id > max)) max = m.id;
  }
  return max;
}

/**
 * TCK-2962 (ADR-0129 § 2) — une carte déjà chargée se relit quand son objet a bougé.
 *
 * Quand un objet change, l'API écrit un `event` dans le fil (TCK-2961), que le signal `message.created`
 * (`useFilEnDirect`) — ou, sans temps réel, la relecture périodique `after_id` — fusionne au fil. Mais la
 * relecture `after_id` n'apporte que le message NEUF : les cartes plus haut gardent la projection d'avant.
 * D'où : quand un `event` ou une `card` plus récent que tous ceux déjà vus arrive, les pages chargées se
 * relisent (projections et `abilities` neuves), et la carte change d'état sans recharger l'écran.
 *
 * Ni un message texte ni une lecture ne relisent les pages : seule l'arrivée d'un message d'objet. Le
 * premier rendu, le premier message d'objet d'un fil qui n'en avait pas, et les pages plus anciennes
 * chargées ensuite (identifiants plus petits) ne relisent rien.
 */
export function useCartesEnDirect(conversationId: number, messages: readonly Message[]): void {
  const queryClient = useContext(QueryClientContext);
  const dernier = dernierMessageDObjet(messages);
  const vu = useRef<{ conversationId: number; dernier: number | null } | null>(null);

  useEffect(() => {
    const avant = vu.current;
    vu.current = { conversationId, dernier };
    // Aucun message d'objet vu jusqu'ici (fil en chargement, ou sans carte) : le premier qui arrive n'a
    // aucune carte plus haut à rafraîchir.
    if (avant === null || avant.conversationId !== conversationId || avant.dernier === null || dernier === null) return;
    if (dernier > avant.dernier) {
      void queryClient?.invalidateQueries({ queryKey: messagesInfiniteQueryKey(conversationId) }, { cancelRefetch: false });
    }
  }, [conversationId, dernier, queryClient]);
}
