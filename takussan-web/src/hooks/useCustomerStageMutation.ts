'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { patchCustomerPipelineStage } from '@/lib/queries/pipeline';
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

type ColumnSnapshot = {
  key: ReturnType<typeof PIPELINE_QUERY_KEY.column>;
  data: PipelineCustomerCard[] | undefined;
};

export function useCustomerStageMutation() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<PipelineCustomerCard, ApiError, StageMutationVars, ColumnSnapshot[]>({
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

    onMutate: async (vars) => {
      const fromKey = PIPELINE_QUERY_KEY.column(vars.from);
      const toKey = PIPELINE_QUERY_KEY.column(vars.to);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: fromKey }),
        queryClient.cancelQueries({ queryKey: toKey }),
      ]);

      const snapshots: ColumnSnapshot[] = [
        { key: fromKey, data: queryClient.getQueryData<PipelineCustomerCard[]>(fromKey) },
        { key: toKey, data: queryClient.getQueryData<PipelineCustomerCard[]>(toKey) },
      ];

      const fromList = snapshots[0].data ?? [];
      const moved = fromList.find((c) => c.id === vars.customerId);

      queryClient.setQueryData<PipelineCustomerCard[]>(fromKey, (old) =>
        (old ?? []).filter((c) => c.id !== vars.customerId),
      );

      if (moved) {
        const updated: PipelineCustomerCard = {
          ...moved,
          pipeline_stage: vars.to,
          updated_at: new Date().toISOString(),
        };
        queryClient.setQueryData<PipelineCustomerCard[]>(toKey, (old) => [
          updated,
          ...(old ?? []).filter((c) => c.id !== vars.customerId),
        ]);
      }

      return snapshots;
    },

    onError: (_err, _vars, context) => {
      if (!context) return;
      for (const snap of context) {
        queryClient.setQueryData(snap.key, snap.data);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.stats() });
    },
  });
}
