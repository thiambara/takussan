'use client';

import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
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
  /**
   * Revue design 2026-09-16 — une colonne qui charge, ou dont la requête a échoué, rendait
   * « Aucun client » : un échec d'API (400 sur les six colonnes, mesuré) se lisait comme un
   * pipeline vide. Les trois états se disent désormais séparément.
   */
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function PipelineColumn({
  stage,
  customers,
  onSelect,
  isDropTarget,
  isLoading,
  isError,
  onRetry,
  className,
}: PipelineColumnProps) {
  const t = useTranslations('crm.pipeline');
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = customers.length;
  const settled = !isLoading && !isError;

  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      data-testid={`pipeline-column-${stage}`}
      aria-busy={isLoading || undefined}
      className={cn(
        'flex h-full w-[300px] shrink-0 snap-start flex-col rounded-xl border-2 border-dashed transition-[border-color,background-color] duration-150',
        STAGE_COLOR[stage],
        // No active highlight by default — only when another card is dragging
        !isDropTarget && 'border-transparent border-solid',
        isDropTarget && !isOver && 'border-muted',
        isOver && 'border-primary/60 bg-primary/5',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-muted/60 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span
            aria-hidden
            className={cn('size-2 rounded-full', STAGE_DOT[stage])}
          />
          {t(`stage.${stage}`)}
        </span>
        {settled ? (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {total}
          </span>
        ) : null}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading ? (
          <>
            <span className="sr-only">{t('loadingColumn')}</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-lg" />
            ))}
          </>
        ) : isError ? (
          onRetry ? (
            <ErrorState
              className="text-sm"
              message={t('errors.loadFailed')}
              onRetry={onRetry}
              retryLabel={t('actions.retry')}
            />
          ) : (
            <ErrorState className="text-sm" message={t('errors.loadFailed')} />
          )
        ) : customers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-muted-foreground/25 px-3 py-6 text-center text-sm text-muted-foreground">
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
