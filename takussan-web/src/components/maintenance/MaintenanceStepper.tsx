'use client';

import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { MaintenanceRequest, MaintenanceStatus } from '@/types/maintenance';

/** `id` EST la clé sous `maintenance.stepper.*` — la donnée porte la clé, le rendu la résout. */
const STEPS = [
  { id: 'created', statuses: ['open', 'acknowledged', 'assigned'] },
  { id: 'quote', statuses: ['quote_requested', 'quote_submitted', 'rejected', 'approved'] },
  { id: 'progress', statuses: ['in_progress'] },
  { id: 'completed', statuses: ['completed', 'closed'] },
] as const;

export function MaintenanceStepper({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.stepper');
  const currentStatus = request.status;

  // Find current step index
  let currentStepIndex = 0;
  for (let i = 0; i < STEPS.length; i++) {
    if ((STEPS[i].statuses as readonly MaintenanceStatus[]).includes(currentStatus)) {
      currentStepIndex = i;
      break;
    }
  }

  // If cancelled, just show a cancelled state
  if (currentStatus === 'cancelled') {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:p-5">
        <div className="flex items-center gap-3 text-destructive">
          <XCircle className="size-5 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{t('cancelled')}</span>
        </div>
      </div>
    );
  }

  // Les libellés étaient en `absolute` + `whitespace-nowrap`, centrés sous des pastilles posées
  // aux deux bords : « Demande créée » et « Terminée » sortaient de la carte, à 390 comme à 1366.
  // Ils sont désormais dans le flux, chaque étape occupant une colonne égale ; le trait qui relie
  // deux pastilles part du centre de l'une vers le centre de la suivante.
  return (
    <div className="rounded-xl bg-card px-2 py-4 sm:px-4 sm:py-5">
      <ol className="grid grid-cols-4">
        {STEPS.map((step, stepIdx) => {
          const isCompleted = currentStepIndex > stepIdx || (stepIdx === STEPS.length - 1 && currentStepIndex === stepIdx);
          const isCurrent = currentStepIndex === stepIdx && !isCompleted;
          const isLast = stepIdx === STEPS.length - 1;

          return (
            <li
              key={step.id}
              className="relative flex flex-col items-center gap-2 px-1 text-center"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isLast ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-3 left-1/2 h-0.5 w-full -translate-y-1/2',
                    currentStepIndex > stepIdx ? 'bg-primary/60' : 'bg-border',
                  )}
                />
              )}
              <span className="relative flex bg-card px-1.5">
                {isCompleted ? (
                  <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
                ) : isCurrent ? (
                  <Clock className="size-6 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span
                className={cn(
                  'text-xs leading-tight font-medium text-balance',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(step.id)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
