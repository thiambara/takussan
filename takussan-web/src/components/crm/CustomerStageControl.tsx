'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { ReasonDialog } from '@/components/pipeline/ReasonDialog';
import { PIPELINE_STAGES, TERMINAL_STAGES } from '@/components/pipeline/constants';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { patchCustomerPipelineStage } from '@/lib/queries/pipeline';
import type { CustomerPipelineStage } from '@/types/customer';

interface CustomerStageControlProps {
  readonly customerId: number;
  readonly name: string;
  readonly stage: CustomerPipelineStage;
}

/**
 * TCK-591 §2 — changer l'étape DEPUIS LA FICHE, sans glisser : le même `<select>` que la carte du
 * pipeline, le même `ReasonDialog` pour une étape terminale (le motif part au serveur, qui en fait
 * une note épinglée). La fiche se relit ensuite côté serveur (`router.refresh()`).
 */
export function CustomerStageControl({ customerId, name, stage }: CustomerStageControlProps) {
  const t = useTranslations('crm.pipeline');
  const tCrm = useTranslations('agentCrm.pipeline');
  const router = useRouter();
  const { token } = useAuth();
  const [pending, setPending] = useState<{ customerId: number; from: CustomerPipelineStage; to: CustomerPipelineStage } | null>(null);

  const mutation = useMutation<unknown, ApiError, { to: CustomerPipelineStage; reason?: string }>({
    mutationFn: ({ to, reason }) => patchCustomerPipelineStage(token ?? '', customerId, to, reason),
    onSuccess: () => router.refresh(),
  });

  const change = (to: CustomerPipelineStage) => {
    if (to === stage) return;
    if (TERMINAL_STAGES.includes(to)) {
      setPending({ customerId, from: stage, to });
      return;
    }
    mutation.mutate({ to });
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="customer-stage-control">
      <select
        value={stage}
        disabled={mutation.isPending}
        onChange={(e) => change(e.target.value as CustomerPipelineStage)}
        aria-label={tCrm('stageSelect', { name })}
        className="min-h-11 rounded-md border border-input bg-background px-2 text-sm"
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>{t(`stage.${s}`)}</option>
        ))}
      </select>
      {mutation.error ? (
        <p role="alert" className="text-sm text-destructive">{mutation.error.proseServeur ?? tCrm('stageFailed')}</p>
      ) : null}
      <ReasonDialog
        pending={pending}
        onCancel={() => setPending(null)}
        onSubmit={(reason) => {
          if (!pending) return;
          mutation.mutate({ to: pending.to, reason });
          setPending(null);
        }}
      />
    </div>
  );
}
