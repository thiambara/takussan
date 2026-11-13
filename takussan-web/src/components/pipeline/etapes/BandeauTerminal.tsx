'use client';

import { useDroppable } from '@dnd-kit/core';
import { ChevronRight, CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface BandeauProps {
  readonly stage: 'converted' | 'lost';
  readonly total: number | undefined;
  readonly onDeplier: () => void;
}

/**
 * TCK-2592 — une étape terminale repliée (maquette a-1) : un bandeau vertical de 48 px qui reçoit les
 * cartes glissées — au pointeur comme au clavier — et se déplie en colonne. Y déposer ouvre le motif.
 */
export function BandeauTerminal({ stage, total, onDeplier }: BandeauProps) {
  const t = useTranslations('crm.pipeline');
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const etape = t(`stage.${stage}`);
  const gagne = stage === 'converted';
  const Icone = gagne ? CircleCheck : CircleX;
  // Survolé seulement (maquette a-1 : Perdu se dit « motif demandé », Gagné ne bouge pas).
  const enVue = isOver;

  return (
    <section
      ref={setNodeRef}
      aria-label={etape}
      data-stage={stage}
      data-testid={`pipeline-band-${stage}`}
      className={cn(
        'flex w-12 flex-none flex-col items-center rounded-xl border transition-[border-color,background-color] duration-150',
        enVue ? (gagne ? 'border-dashed border-success/60 bg-success/8' : 'border-dashed border-destructive/60 bg-destructive/8') : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={onDeplier}
        aria-label={t('bandeau.deplier', { stage: etape, count: total ?? 0 })}
        aria-expanded={false}
        className="flex w-full flex-1 flex-col items-center gap-3 rounded-xl py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Icone className={cn('size-4', gagne ? 'text-success' : enVue ? 'text-destructive' : 'text-muted-foreground')} aria-hidden="true" />
        <span className="font-display text-base font-semibold tabular-nums">{total ?? '—'}</span>
        <span className="rotate-180 whitespace-nowrap text-sm font-semibold [writing-mode:vertical-rl]">{etape}</span>
        {enVue ? (
          <span className={cn('mt-auto rotate-180 whitespace-nowrap text-xs font-medium [writing-mode:vertical-rl]', gagne ? 'text-success' : 'text-destructive')}>{t('bandeau.deposer')}</span>
        ) : (
          <ChevronRight className="mt-auto size-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
    </section>
  );
}
