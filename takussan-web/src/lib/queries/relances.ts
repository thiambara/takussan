'use client';

import { useQueryClient, type QueryKey } from '@tanstack/react-query';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';
import type { PaymentHistoryResponse } from './payments';

/**
 * TCK-2658 / TCK-2660 (ADR-0105) — les relances d'une échéance de bail.
 *
 * Takussan n'envoie rien : l'écran ouvre WhatsApp ou l'appel sur le téléphone de l'agence, et
 * `POST …/reminders {channel}` NOTE le fait. La lecture (`GET …/reminders`) fusionne les relances
 * notées (`manual`, avec leur auteur) et les rappels automatiques du job (`automatic`, sans canal ni
 * auteur, `milestone` : `due_soon`, `overdue_1`, `overdue_7`…), de la plus récente à la plus ancienne.
 */
export type CanalDeRelance = 'whatsapp' | 'call';

export interface RelanceDUneEcheance {
  readonly at: string;
  readonly source: 'manual' | 'automatic';
  readonly channel: CanalDeRelance | null;
  readonly by: { readonly id: number; readonly name: string | null } | null;
  readonly note: string | null;
  readonly milestone: string | null;
}

export const relancesQueryKeys = {
  echeance: (paymentId: number) => ['lease-payments', paymentId, 'reminders'] as const,
};

export function useRelancesDeLEcheance(paymentId: number | null | undefined) {
  return useApiQuery<ApiResponse<RelanceDUneEcheance[]>>(
    relancesQueryKeys.echeance(paymentId ?? 0),
    cheminApi`/api/lease-payments/${paymentId ?? 0}/reminders`,
    { enabled: Boolean(paymentId) },
  );
}

/**
 * Noter une relance. Au succès, la ligne de l'historique qui porte l'échéance prend cette relance
 * pour dernière (« relancé aujourd'hui ») SANS rechargement (AC1), dans toutes les pages en cache.
 */
/** `onError` se pose sur la MUTATION (pas sur l'appel `mutate`) : il survit au démontage du geste qui l'a lancée. */
export function useNoterUneRelance({ onError }: { readonly onError?: (erreur: unknown) => void } = {}) {
  const queryClient = useQueryClient();
  return useApiMutation<ApiResponse<RelanceDUneEcheance>, { paymentId: number; channel: CanalDeRelance }>(
    {
      path: ({ paymentId }) => cheminApi`/api/lease-payments/${paymentId}/reminders`,
      method: 'POST',
      body: ({ channel }) => ({ channel }),
    },
    {
      invalidate: ({ variables }) => [relancesQueryKeys.echeance(variables.paymentId) as unknown as QueryKey],
      onError: (erreur) => onError?.(erreur),
      onSuccess: (reponse, { paymentId }) => {
        const relance = reponse.data;
        queryClient.setQueriesData<PaymentHistoryResponse>({ queryKey: ['payments', 'history'] }, (ancien) =>
          ancien
            ? {
                ...ancien,
                data: ancien.data.map((row) =>
                  row.source === 'lease' && row.id === paymentId
                    ? {
                        ...row,
                        last_reminder: { at: relance.at, source: relance.source, channel: relance.channel, by: relance.by },
                        reminders_count: (row.reminders_count ?? 0) + 1,
                      }
                    : row,
                ),
              }
            : ancien,
        );
      },
    },
  );
}
