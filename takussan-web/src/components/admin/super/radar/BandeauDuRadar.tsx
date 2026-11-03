'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronRight } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { comparerMontantsIa, equivalentXofIa, formaterMontantIa } from '@/lib/format/montant-ia';
import { cn } from '@/lib/utils';
import type { RadarDashboardResponse, RadarListingStage } from '@/types/radar';

interface BandeauDuRadarProps {
  readonly compteurs: RadarDashboardResponse['data'] | undefined;
  readonly chargement: boolean;
  readonly etape: RadarListingStage | '';
  readonly onEtape: (etape: RadarListingStage | '') => void;
}

/** Le parcours d'une annonce, dans l'ordre où l'opérateur la traite. */
const PARCOURS = [
  { etape: 'extracted', cle: 'toReview' },
  { etape: 'reviewed', cle: 'toContact' },
  { etape: 'published', cle: 'published' },
] as const;

function Valeur({ chargement, children }: { readonly chargement: boolean; readonly children: ReactNode }) {
  if (chargement) return <Skeleton className="h-7 w-10" />;
  return <span className="font-display text-2xl leading-7 font-bold tabular-nums">{children}</span>;
}

/**
 * TCK-2461 — ce que le Radar demande maintenant. Six tuiles de même poids disaient six choses égales : les étapes du
 * parcours se lisent ici dans leur ordre, chacune filtre la liste, et une étape en attente de l'opérateur porte la
 * couleur d'action. Les échecs ne s'allument que s'il y en a. Le coût IA quitte la rangée des décisions.
 */
export function BandeauDuRadar({ compteurs, chargement, etape, onEtape }: BandeauDuRadarProps) {
  const t = useTranslations('superAdmin.pages.radar');
  const ai = compteurs?.ai;
  const depense = ai?.spent_today_usd ?? '0';
  const budget = ai?.daily_budget_usd ?? null;
  const plafondAtteint = budget !== null && comparerMontantsIa(depense, budget) >= 0;
  const echecs = compteurs?.stages.extraction_failed ?? 0;
  const enAttente = compteurs?.pending_extraction ?? 0;
  const equivalent = equivalentXofIa(depense, ai?.usd_to_xof) ?? '—';

  const basculer = (suivante: RadarListingStage) => onEtape(etape === suivante ? '' : suivante);

  return (
    <section
      aria-label={t('counters.aria')}
      className="grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(14rem,auto)]"
      data-testid="radar-counters"
    >
      <ol className="grid grid-cols-3 bg-card">
        {PARCOURS.map(({ etape: valeur, cle }, index) => {
          const nombre = compteurs?.stages[valeur] ?? 0;
          const aTraiter = valeur !== 'published' && nombre > 0;
          return (
            <li key={valeur} className="relative">
              <button
                type="button"
                onClick={() => basculer(valeur)}
                aria-pressed={etape === valeur}
                data-testid={`radar-counter-${valeur}`}
                className={cn(
                  'flex h-full w-full flex-col gap-1 px-3 py-3 text-left sm:px-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                  'aria-pressed:bg-primary/10 aria-pressed:shadow-[inset_0_-2px_0_var(--primary)]',
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">{t(`counters.${cle}`)}</span>
                <span className={cn(aTraiter ? 'text-primary' : 'text-foreground')}>
                  <Valeur chargement={chargement}>{nombre}</Valeur>
                </span>
              </button>
              {index < PARCOURS.length - 1 ? (
                <ChevronRight className="absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground sm:block" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-2 bg-card">
        <button
          type="button"
          onClick={() => basculer('extraction_failed')}
          aria-pressed={etape === 'extraction_failed'}
          data-testid="radar-counter-extraction_failed"
          className={cn(
            'flex flex-col gap-1 px-3 py-3 text-left sm:px-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
            'aria-pressed:bg-destructive/10 aria-pressed:shadow-[inset_0_-2px_0_var(--destructive)]',
          )}
        >
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {echecs > 0 ? <AlertTriangle className="size-3.5 text-destructive" aria-hidden="true" /> : null}
            {t('counters.failed')}
          </span>
          <span className={cn(echecs > 0 ? 'text-destructive' : 'text-foreground')}>
            <Valeur chargement={chargement}>{echecs}</Valeur>
          </span>
        </button>
        <div className="flex flex-col gap-1 px-3 py-3 sm:px-4" data-testid="radar-counter-pending">
          <span className="text-xs font-medium text-muted-foreground">{t('counters.pending')}</span>
          <span className="text-foreground"><Valeur chargement={chargement}>{enAttente}</Valeur></span>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-1 bg-card px-3 py-3 sm:px-4" data-testid="radar-counter-ai">
        <span className="text-xs font-medium text-muted-foreground">{t('counters.aiCost')}</span>
        <span className={cn('text-sm font-semibold tabular-nums', plafondAtteint ? 'text-destructive' : 'text-foreground')}>
          {chargement ? <Skeleton className="h-5 w-16" /> : formaterMontantIa(depense)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {budget !== null
            ? t('counters.aiCostBudget', { equivalent, budget: formaterMontantIa(budget) })
            : t('counters.aiCostNoBudget', { equivalent })}
        </span>
      </div>
    </section>
  );
}
