'use client';

import { useApiMutation } from '@/hooks/useApiQuery';
import { messagesInfiniteQueryKey, nouveauxMessagesQueryKey } from '@/lib/queries/conversations-cles';

import { cheminDuGeste, ROUTES_DES_GESTES, type GesteDEngagement } from './engagement';

export interface AppelDeGeste {
  readonly geste: GesteDEngagement;
  readonly id: number;
  readonly corps?: Record<string, unknown>;
}

/** La clé de la liste « Engagements de ce fil ». */
export function engagementsDuFilQueryKey(conversationId: number) {
  return ['conversations', conversationId, 'commitments'] as const;
}

/**
 * TCK-2972 (ADR-0130 § 2) — un geste d'engagement appelle la route DE L'ENGAGEMENT, puis relit le fil et
 * la liste des engagements, sur succès comme sur erreur (`relireSurErreur` : un 422 `invalid_state` dit
 * souvent que le geste est déjà fait). `useGesteDeLaCarte` ne sait que POST : `update` est un PUT, d'où
 * deux mutations, dont une seule part selon la table {@link ROUTES_DES_GESTES}.
 */
export function useGesteDEngagement(conversationId: number) {
  const invalidate = [messagesInfiniteQueryKey(conversationId), nouveauxMessagesQueryKey(conversationId), [...engagementsDuFilQueryKey(conversationId)]];
  const post = useApiMutation<unknown, AppelDeGeste>(
    { path: ({ id, geste }) => cheminDuGeste(id, geste), method: 'POST', body: ({ corps }) => corps },
    { relireSurErreur: true, invalidate },
  );
  const put = useApiMutation<unknown, AppelDeGeste>(
    { path: ({ id, geste }) => cheminDuGeste(id, geste), method: 'PUT', body: ({ corps }) => corps },
    { relireSurErreur: true, invalidate },
  );
  const appeler = (appel: AppelDeGeste, options?: { onSuccess?: () => void }) =>
    (ROUTES_DES_GESTES[appel.geste].methode === 'PUT' ? put : post).mutate(appel, options);
  return {
    appeler,
    isPending: post.isPending || put.isPending,
    error: post.error ?? put.error,
    reset: () => {
      post.reset();
      put.reset();
    },
  };
}
