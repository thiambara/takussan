'use client';

import type { QueryKey } from '@tanstack/react-query';

import { useApiMutation } from '@/hooks/useApiQuery';
import { messagesInfiniteQueryKey, nouveauxMessagesQueryKey } from '@/lib/queries/conversations-cles';

/** Un geste de carte : la route DE L'OBJET (jamais une route de la messagerie), et son corps éventuel. */
export interface GesteDeCarte {
  readonly chemin: string;
  readonly corps?: Record<string, unknown>;
}

/**
 * TCK-2962 (ADR-0128 § 4) — le geste d'une carte appelle la route de son objet, puis relit le fil : la
 * carte se relit avec la projection et les `abilities` neuves. Sur une erreur aussi (`relireSurErreur`) :
 * un 403 ou un 422 de garde d'état dit souvent que le geste n'est plus permis, ou déjà fait.
 *
 * `clesDeLObjet` : les requêtes des écrans de l'objet, relues avec le fil.
 *
 * Monté par les SEULS composants de geste (une carte sans geste n'en a pas besoin), sous le client de
 * requêtes de l'application.
 */
export function useGesteDeLaCarte(conversationId: number, clesDeLObjet: readonly QueryKey[] = []) {
  return useApiMutation<unknown, GesteDeCarte>(
    { path: ({ chemin }) => chemin, method: 'POST', body: ({ corps }) => corps },
    {
      relireSurErreur: true,
      invalidate: [messagesInfiniteQueryKey(conversationId), nouveauxMessagesQueryKey(conversationId), ...clesDeLObjet],
    },
  );
}

/**
 * Les requêtes des écrans de l'objet qu'un geste de carte rend périmées — les mêmes que les mutations de
 * ces écrans (`lib/queries/maintenance.ts`, `bookings.ts`, `visits.ts`, `leases.ts`), écrites ici en
 * littéraux : la fiche de l'objet ne garde pas, cinq minutes durant, l'état d'avant le geste.
 */
export const clesDeLObjet = {
  // `maintenanceKeys.all` : la liste, la fiche, le journal de toute intervention.
  intervention: (): QueryKey[] => [['maintenance']],
  reservation: (id: number): QueryKey[] => [['bookings', 'detail', id], ['bookings', 'list']],
  visite: (id: number): QueryKey[] => [['visits', 'list'], ['visits', 'detail', id]],
  echeance: (leaseId: number | null | undefined): QueryKey[] =>
    leaseId ? [['leases', 'detail', leaseId], ['leases', 'payments', leaseId], ['leases', 'list'], ['payments', 'history']] : [['payments', 'history']],
};

