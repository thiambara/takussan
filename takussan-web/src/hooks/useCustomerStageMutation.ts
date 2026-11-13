'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { type PagePipeline, patchCustomerPipelineStage } from '@/lib/queries/pipeline';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import { PIPELINE_QUERY_KEY } from './pipelineKeys';

/**
 * TCK-083 — Optimistic stage mutation for the CRM kanban.
 *
 * Strategy:
 *   1. Snapshot every column-cache currently in TanStack Query.
 *   2. Remove the dragged card from its old column and insert it into the
 *      new one (top of the column to mirror the `-updated_at` sort).
 *   3. On error, restore the snapshot exactly. On success, invalidate the
 *      pipeline-stats key so widgets re-fetch.
 *
 * Variables:
 *   - `customerId` — the dragged card.
 *   - `from` / `to` — stages used to update only the two affected caches.
 *   - `reason` — required by the backend when transitioning to a terminal
 *     stage (`converted` / `lost`). The caller is responsible for prompting
 *     the user; if absent on a terminal transition, the backend simply
 *     skips the auto-note (no error).
 */
export interface StageMutationVars {
  customerId: number;
  from: CustomerPipelineStage;
  to: CustomerPipelineStage;
  reason?: string;
}

type Snapshot = {
  key: readonly unknown[];
  data: unknown;
};

const TERMINALES: readonly CustomerPipelineStage[] = ['converted', 'lost'];

export function useCustomerStageMutation() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<PipelineCustomerCard, ApiError, StageMutationVars, Snapshot[]>({
    mutationFn: async (vars) => {
      if (!token) throw new ApiError(401, { message: 'unauthenticated' });
      const res = await patchCustomerPipelineStage(
        token,
        vars.customerId,
        vars.to,
        vars.reason,
      );
      return res as unknown as PipelineCustomerCard;
    },

    // TCK-2592 — une colonne a une copie par portée et filtres (`PIPELINE_QUERY_KEY.column(stage,
    // filtres)`), et la liste des relances porte aussi la carte : TOUTES sont déplacées, et toutes
    // reviennent sur un refus. La copie cible est celle des mêmes filtres que la source.
    onMutate: async (vars) => {
      const prefixes = [
        PIPELINE_QUERY_KEY.columnsOf(vars.from),
        PIPELINE_QUERY_KEY.columnsOf(vars.to),
        PIPELINE_QUERY_KEY.listsAll(),
      ];
      await Promise.all(prefixes.map((queryKey) => queryClient.cancelQueries({ queryKey })));

      const snapshots: Snapshot[] = prefixes.flatMap((queryKey) =>
        queryClient.getQueriesData({ queryKey }).map(([key, data]) => ({ key, data })),
      );

      const maintenant = new Date().toISOString();
      for (const [key, data] of queryClient.getQueriesData<PipelineCustomerCard[]>({ queryKey: PIPELINE_QUERY_KEY.columnsOf(vars.from) })) {
        const moved = (data ?? []).find((c) => c.id === vars.customerId);
        queryClient.setQueryData<PipelineCustomerCard[]>(key, (old) => (old ?? []).filter((c) => c.id !== vars.customerId));
        if (!moved) continue;
        const filtres = typeof key[3] === 'string' ? key[3] : '';
        const toKey = PIPELINE_QUERY_KEY.column(vars.to, filtres);
        // Une colonne cible jamais lue (un bandeau replié) n'est pas créée : elle se lira à l'ouverture.
        if (queryClient.getQueryData(toKey) === undefined) continue;
        const updated: PipelineCustomerCard = { ...moved, pipeline_stage: vars.to, updated_at: maintenant, suggested_stage: null };
        queryClient.setQueryData<PipelineCustomerCard[]>(toKey, (old) => [updated, ...(old ?? []).filter((c) => c.id !== vars.customerId)]);
      }

      // Les listes ne portent que les étapes vivantes : une sortie (Gagné, Perdu) en retire la ligne.
      for (const [key, data] of queryClient.getQueriesData<PagePipeline>({ queryKey: PIPELINE_QUERY_KEY.listsAll() })) {
        if (!data || !data.lignes.some((c) => c.id === vars.customerId)) continue;
        const sortie = TERMINALES.includes(vars.to);
        queryClient.setQueryData<PagePipeline>(key, {
          lignes: sortie
            ? data.lignes.filter((c) => c.id !== vars.customerId)
            : data.lignes.map((c) => (c.id === vars.customerId ? { ...c, pipeline_stage: vars.to, updated_at: maintenant, suggested_stage: null } : c)),
          total: sortie ? Math.max(0, data.total - 1) : data.total,
        });
      }

      return snapshots;
    },

    onError: (_err, _vars, context) => {
      if (!context) return;
      for (const snap of context) {
        queryClient.setQueryData(snap.key, snap.data);
      }
    },

    // TCK-2592 — relire après coup : les comptes (statistiques), et l'ordre par retard des colonnes et
    // des listes, que le serveur seul connaît (une étape changée n'est pas un contact).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.root() });
    },
  });
}
