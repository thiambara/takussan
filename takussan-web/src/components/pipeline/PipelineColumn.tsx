'use client';

import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import { PipelineCard } from './PipelineCard';
import { STAGE_COLOR, STAGE_DOT } from './constants';

interface PipelineColumnProps {
  stage: CustomerPipelineStage;
  customers: PipelineCustomerCard[];
  onSelect: (id: number) => void;
  /** When the user is dragging from another column, highlight us as a target. */
  isDropTarget?: boolean;
}

export function PipelineColumn({
  stage,
  customers,
  onSelect,
  isDropTarget,
}: PipelineColumnProps) {
  const t = useTranslations('crm.pipeline');
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = customers.length;

  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      data-testid={`pipeline-column-${stage}`}
      className={cn(
        'flex h-full w-[300px] shrink-0 flex-col rounded-xl border-2 border-dashed transition',
        STAGE_COLOR[stage],
        // No active highlight by default — only when another card is dragging
        !isDropTarget && 'border-transparent border-solid',
        isDropTarget && !isOver && 'border-app-surface-2',
        isOver && 'border-primary/60 bg-primary/5',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-app-surface-2/60 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-app-ink">
          <span
            aria-hidden
            className={cn('size-2 rounded-full', STAGE_DOT[stage])}
          />
          {t(`stage.${stage}`)}
        </span>
        <span className="rounded-full bg-app-surface-2/60 px-2 py-0.5 text-xs font-medium text-app-ink-muted">
          {total}
        </span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {customers.length === 0 ? (
          <p className="rounded-md border border-dashed border-app-surface-2 px-3 py-6 text-center text-xs text-app-ink-muted">
            {t('emptyColumn')}
          </p>
        ) : (
          customers.map((customer) => (
            <PipelineCard
              key={customer.id}
              customer={customer}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
