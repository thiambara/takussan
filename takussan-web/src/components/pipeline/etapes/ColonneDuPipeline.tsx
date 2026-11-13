'use client';

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';

interface ColonneProps {
  readonly stage: CustomerPipelineStage;
  /** Le compte de l'étape (statistiques, TCK-591) ; à défaut, le nombre de cartes chargées. */
  readonly total: number | undefined;
  readonly chargees: number;
  /** La durée médiane dans l'étape, en jours (TCK-2591) ; `null` : aucun passage mesuré. */
  readonly mediane?: number | null;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly onRetry?: () => void;
  readonly onLoadMore?: () => void;
  readonly isLoadingMore?: boolean;
  /** Une colonne terminale dépliée : son bouton pour se replier. */
  readonly onReplier?: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * TCK-2592 — une colonne du kanban (maquette a-1) : l'étape, son compte et sa médiane, les cartes, puis
 * « Charger plus (x/total) ». Trois états se disent séparément (revue design 2026-09-16) : squelettes,
 * erreur avec « Réessayer », vide (« Déposer une carte ici »).
 */
export function ColonneDuPipeline({ stage, total: totalStats, chargees, mediane, isLoading, isError, onRetry, onLoadMore, isLoadingMore, onReplier, children, className }: ColonneProps) {
  const t = useTranslations('crm.pipeline');
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = Math.max(totalStats ?? 0, chargees);
  const etape = t(`stage.${stage}`);

  return (
    <section
      ref={setNodeRef}
      aria-label={etape}
      data-stage={stage}
      data-testid={`pipeline-column-${stage}`}
      aria-busy={isLoading || undefined}
      className={cn(
        // Seule la colonne survolée se dit cible (maquette a-1) : les autres ne bougent pas pendant le vol.
        'flex min-w-0 flex-1 flex-col rounded-xl bg-muted/60 outline-2 outline-offset-0 outline-transparent transition-[outline-color,background-color] duration-150',
        isOver && 'bg-primary/5 outline-primary/60',
        className,
      )}
    >
      <header className="flex h-11 flex-none items-center gap-2 px-3">
        {onReplier ? (
          <button type="button" onClick={onReplier} aria-label={t('bandeau.replier', { stage: etape })} className="-ml-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <h2 className="text-sm font-semibold">{etape}</h2>
        {!isLoading && !isError ? <span className="text-sm tabular-nums text-muted-foreground">{total}</span> : null}
        {mediane !== undefined && mediane !== null ? (
          <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{t('colonne.mediane', { n: Math.round(mediane) })}</span>
        ) : null}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <>
            <span className="sr-only">{t('loadingColumn')}</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </>
        ) : isError ? (
          onRetry ? <ErrorState className="text-sm" message={t('errors.loadFailed')} onRetry={onRetry} retryLabel={t('actions.retry')} /> : <ErrorState className="text-sm" message={t('errors.loadFailed')} />
        ) : chargees === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">{t('colonne.deposer')}</p>
        ) : (
          <>
            {children}
            {total > chargees && onLoadMore ? (
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={onLoadMore}
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium text-primary outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
              >
                {isLoadingMore ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {t('colonne.chargerPlus', { shown: chargees, total })}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
