'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useWizardDraft } from '@/hooks/useWizardDraft';

/**
 * TCK-250 — Generic resumable wizard.
 *
 * Renders a multi-step form shell with:
 * - top progress bar + step badges,
 * - per-step body provided by the consumer (via `steps[i].render`),
 * - bottom Précédent / Suivant / Terminer navigation,
 * - silent autosave (debounced 800ms by default — see `useWizardDraft`),
 * - "progress saved" toast when navigating away mid-flow.
 *
 * The consumer owns the data shape (`TData`) and per-step validation
 * (`steps[i].canAdvance`). The component is intentionally form-library
 * agnostic — wire it to `react-hook-form`, `zod`, plain state, anything.
 *
 * Drafts MUST NOT contain sensitive data (passwords, tokens) — that
 * contract is enforced at the consumer level.
 */
export type WizardStep<TData> = {
  /** Stable id, used for ARIA + step badges. */
  id: string;
  /** i18n title shown in the step badge and tooltip. */
  title: string;
  /** Optional subtitle shown under the page title. */
  subtitle?: string;
  /** Renders the step body. Receives the current draft data + a setter. */
  render: (api: { data: TData; setData: (next: TData) => void }) => React.ReactNode;
  /** Optional gate — return false to disable the "Suivant" button. */
  canAdvance?: (data: TData) => boolean;
};

export type WizardReprenableProps<TData> = {
  /** Logical wizard key (e.g. `host-individual-wizard`). Must be stable per user/wizard. */
  storageKey: string;
  /** Initial data when no draft is on the server yet (skeleton, not user input). */
  initialData: TData;
  /** Ordered list of steps. Must contain at least one entry. */
  steps: WizardStep<TData>[];
  /** Called after the last step completes. Receives the final data. */
  onComplete: (data: TData) => void | Promise<void>;
  /** Optional debounce window for autosave. Defaults to 800ms. */
  debounceMs?: number;
  /** Optional class name applied to the root container. */
  className?: string;
};

// Deep-merge a persisted draft over the initial skeleton. Recurses into plain
// objects so nested defaults survive partial drafts; treats null leaves as
// "missing" and falls back to the initial value (React controlled inputs
// reject value={null}).
function mergeDraft<T>(base: T, patch: Partial<T> | null | undefined): T {
  if (patch === null || patch === undefined) return base;
  if (
    typeof base !== 'object' ||
    base === null ||
    Array.isArray(base) ||
    typeof patch !== 'object' ||
    Array.isArray(patch)
  ) {
    return (patch as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch as Record<string, unknown>)) {
    const next = (patch as Record<string, unknown>)[key];
    if (next === null) continue;
    out[key] = mergeDraft(
      (base as Record<string, unknown>)[key] as unknown,
      next as never,
    );
  }
  return out as T;
}

export function WizardReprenable<TData extends Record<string, unknown>>({
  storageKey,
  initialData,
  steps,
  onComplete,
  debounceMs = 800,
  className,
}: WizardReprenableProps<TData>) {
  const t = useTranslations('wizardDrafts.component');
  const toast = useToast();
  const { draft, isLoading, save, flush, clear } = useWizardDraft<TData>(storageKey, {
    debounceMs,
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<TData>(initialData);
  const [hydrated, setHydrated] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Hydrate local state once the initial GET resolves.
  useEffect(() => {
    if (isLoading || hydrated) return;
    if (draft && draft.data) {
      setStepIndex(Math.min(draft.step, steps.length - 1));
      setData(mergeDraft(initialData, draft.data as Partial<TData>));
    }
    setHydrated(true);
  }, [draft, isLoading, hydrated, initialData, steps.length]);

  // Autosave on every change once we've hydrated. The debounce inside
  // `useWizardDraft` collapses bursts into a single PUT.
  useEffect(() => {
    if (!hydrated) return;
    save(stepIndex, data);
  }, [hydrated, stepIndex, data, save]);

  // Toast a discreet "progress saved" message on unmount / page hide so
  // the user knows nothing was lost. We flush any pending debounce first.
  useEffect(() => {
    if (!hydrated) return;

    const handlePageHide = () => {
      void flush();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      void flush().then(() => {
        if (typeof window !== 'undefined') {
          // Toast only when leaving via React unmount with pending work —
          // skip if we already cleared the draft (completion path).
          if (!completing) {
            toast.add({ title: t('savedToastTitle'), description: t('savedToastBody'), type: 'success' });
          }
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const totalSteps = steps.length;
  const current = steps[stepIndex];
  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / totalSteps) * 100),
    [stepIndex, totalSteps],
  );

  const canAdvance = current.canAdvance ? current.canAdvance(data) : true;
  const isLast = stepIndex === totalSteps - 1;

  const handlePrevious = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(async () => {
    if (!canAdvance) return;
    if (!isLast) {
      setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
      return;
    }
    setCompleting(true);
    try {
      await flush();
      await onComplete(data);
      await clear();
    } finally {
      setCompleting(false);
    }
  }, [canAdvance, isLast, totalSteps, flush, onComplete, data, clear]);

  return (
    <section
      aria-label={t('ariaLabel')}
      className={cn('mx-auto flex w-full max-w-2xl flex-col gap-6', className)}
    >
      <header className="flex flex-col gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={t('progressAriaLabel', { current: stepIndex + 1, total: totalSteps })}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {steps.map((step, idx) => {
            const isActive = idx === stepIndex;
            const isDone = idx < stepIndex;
            return (
              <li key={step.id} className="flex items-center gap-2">
                <span
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px]',
                    isActive && 'border-primary bg-primary text-primary-foreground',
                    isDone && 'border-accent bg-accent text-primary-foreground',
                    !isActive && !isDone && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="size-3" aria-hidden /> : idx + 1}
                </span>
                <span className="hidden sm:inline">{step.title}</span>
                {idx < steps.length - 1 ? <span aria-hidden>·</span> : null}
              </li>
            );
          })}
        </ol>

        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-tight text-foreground">{current.title}</h2>
          {current.subtitle ? (
            <p className="text-sm text-muted-foreground">{current.subtitle}</p>
          ) : null}
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {!hydrated ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : (
          current.render({ data, setData })
        )}
      </div>

      <footer className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={handlePrevious}
          disabled={stepIndex === 0 || completing}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t('previous')}
        </Button>

        <Button
          type="button"
          size="lg"
          onClick={handleNext}
          disabled={!canAdvance || completing}
        >
          {isLast ? t('complete') : t('next')}
          {!isLast ? <ChevronRight className="size-4" aria-hidden /> : null}
        </Button>
      </footer>
    </section>
  );
}
