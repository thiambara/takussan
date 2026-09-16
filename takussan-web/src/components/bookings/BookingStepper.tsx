'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BookingStep {
  readonly key: string;
  readonly label: string;
}

interface BookingStepperProps {
  readonly steps: readonly BookingStep[];
  readonly currentIndex: number;
}

/**
 * Visual progress indicator for the multi-step booking tunnel.
 *
 * Stateless — the parent owns the active step index. Accessibility:
 * the completed and current steps expose `aria-current="step"` / a visually
 * hidden status so screen readers announce progress on change.
 */
export function BookingStepper({ steps, currentIndex }: BookingStepperProps) {
  const t = useTranslations('bookings.stepper');
  return (
    <ol className="flex items-center gap-2" aria-label={t('aria')}>
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li
            key={step.key}
            className="flex flex-1 items-center gap-2"
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums transition-colors duration-150',
                isCompleted && 'border-foreground bg-foreground text-background',
                isCurrent && 'border-foreground bg-card text-foreground',
                !isCompleted && !isCurrent && 'border-border bg-card text-muted-foreground',
              )}
            >
              {isCompleted ? <Check className="size-4" aria-hidden /> : index + 1}
            </div>
            <span
              className={cn(
                'hidden text-sm font-medium sm:inline',
                isCurrent && 'text-foreground',
                isCompleted && 'text-muted-foreground',
                !isCompleted && !isCurrent && 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'h-px flex-1',
                  isCompleted ? 'bg-foreground' : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
