'use client';

import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
      <div className="rounded-2xl bg-app-surface-1 p-5 border border-destructive/20 bg-destructive/5">
        <div className="flex items-center gap-3 text-destructive">
          <Circle className="h-5 w-5 fill-current" />
          <span className="font-semibold">{t('cancelled')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-app-surface-1 p-5">
      <div className="relative">
        <div className="absolute left-0 top-1/2 -mt-px w-full h-0.5 bg-app-border" aria-hidden="true" />
        <ul className="relative flex w-full justify-between">
          {STEPS.map((step, stepIdx) => {
            const isCompleted = currentStepIndex > stepIdx || (stepIdx === STEPS.length - 1 && currentStepIndex === stepIdx);
            const isCurrent = currentStepIndex === stepIdx && !isCompleted;
            const isUpcoming = currentStepIndex < stepIdx;

            return (
              <li key={step.id} className="relative text-center">
                <span className="flex items-center justify-center bg-app-surface-1 px-2">
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  ) : isCurrent ? (
                    <Clock className="h-6 w-6 text-primary" />
                  ) : (
                    <Circle className="h-6 w-6 text-app-ink-muted" />
                  )}
                </span>
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-app-ink-muted">
                  {t(step.id)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="h-6" /> {/* spacer for absolute labels */}
    </div>
  );
}
