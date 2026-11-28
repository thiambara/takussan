'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import { appelBff } from '@/lib/bff';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import {
  relaisImpersonationActif,
  type ImpersonationCourante,
  type ImpersonationDemarree,
} from '@/lib/impersonation';

/**
 * TCK-600 (ADR-0055 §6) — la session d'impersonation, vue du navigateur : il ne tient JAMAIS le
 * jeton. Il démarre et termine par les route handlers dédiés, et lit la session courante sur
 * `GET /api/impersonation/current` (relayé avec le jeton, côté serveur).
 */
export const CLE_IMPERSONATION_COURANTE = ['impersonation', 'current'] as const;

/** La session ouverte, ou `null`. N'interroge rien quand le témoin de session est absent. */
export function useImpersonationCourante() {
  return useQuery<ImpersonationCourante | null>({
    queryKey: CLE_IMPERSONATION_COURANTE,
    queryFn: async () => {
      if (!relaisImpersonationActif()) return null;
      try {
        return (await appelBff<{ data: ImpersonationCourante }>('/api/impersonation/current', { cache: 'no-store' })).data;
      } catch (erreur) {
        // Aucune session (404), ou plus de jeton (401) : un état, pas une panne.
        if (erreur instanceof ApiError && (erreur.status === 404 || erreur.status === 401)) return null;
        throw erreur;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Démarrer : motif obligatoire ; un step-up demandé par l'API ouvre la boîte de la console. */
export function useDemarrerImpersonation() {
  const garde = useGardeDoubleFacteur();
  return useMutation<ImpersonationDemarree, ApiError, { userId: number; reason: string }>({
    mutationFn: ({ userId, reason }) =>
      avecGardeDoubleFacteur(async () => {
        const { data } = await appelBff<{ data: ImpersonationDemarree }>('/api/impersonation/start', {
          method: 'POST',
          body: { user_id: userId, reason },
        });
        return data;
      }, garde),
  });
}

/** Quitter : le route handler ferme la session avec le jeton de l'opérateur et efface les cookies. */
export function useQuitterImpersonation() {
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      // Un 404 dit « déjà fermée » (échue, retirée) : la sortie a lieu quand même.
      await appelBff('/api/impersonation/stop', { method: 'POST' }).catch(() => null);
    },
  });
}
