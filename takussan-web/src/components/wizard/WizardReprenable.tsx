'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  /**
   * ── TCK-483 — ce que le garde du toast de succès doit lire ───────────────────
   *
   * « Le brouillon a été effacé volontairement », et non « une finalisation est
   * en cours ». Les deux ne coïncident pas : `completing` retombe à `false` dans
   * le `finally` de `handleNext`, donc AVANT le démontage qu'une navigation de
   * fin de parcours provoque. Un `completing` simplement rendu lisible laisserait
   * donc passer le toast fautif exactement là où on veut l'éteindre.
   *
   * Le ref est armé à l'entrée du chemin de finalisation et désarmé si ce chemin
   * s'interrompt avant `clear()` — auquel cas le brouillon vit toujours, et une
   * sauvegarde ultérieure a bien lieu d'être annoncée.
   */
  const finalisationRef = useRef(false);

  // Hydratation de l'état local dès que le GET initial est résolu.
  //
  // TCK-316 — pendant le RENDU, pas dans un effet : l'effet affichait l'étape 0
  // avec les données initiales, puis sautait à l'étape reprise au tick suivant.
  // L'écriture converge (`hydrated` passe à `true` définitivement).
  if (!hydrated && !isLoading) {
    setHydrated(true);
    if (draft?.data) {
      setStepIndex(Math.min(draft.step, steps.length - 1));
      setData(mergeDraft(initialData, draft.data as Partial<TData>));
    }
  }

  // Autosave on every change once we've hydrated. The debounce inside
  // `useWizardDraft` collapses bursts into a single PUT.
  useEffect(() => {
    if (!hydrated) return;
    save(stepIndex, data);
  }, [hydrated, stepIndex, data, save]);

  // Toast a discreet "progress saved" message on unmount / page hide so
  // the user knows nothing was lost. We flush any pending debounce first.
  //
  // ── TCK-475, SITE 1 (démontage / départ de page) ────────────────────────────
  // Le toast partait sans jamais regarder le sort de l'écriture : un PUT refusé
  // (réseau coupé, session expirée, 5xx du proxy) affichait le même
  // « Progression sauvegardée » qu'un PUT accepté. `flush()` rend ce sort depuis
  // TCK-465 ; il ne restait qu'à le LIRE. On le lit ici.
  useEffect(() => {
    if (!hydrated) return;

    const handlePageHide = () => {
      void flush();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      void flush().then((resultat) => {
        if (typeof window === 'undefined') return;
        if (!resultat.ok) {
          // Le remède n'est PAS le même que sur le chemin de finalisation : ici
          // la personne est déjà partie, on lui dit quoi retrouver en revenant.
          toast.add({
            title: t('saveFailedToastTitle'),
            description: t('saveFailedToastBody'),
            type: 'error',
          });
          return;
        }
        // Toast only when leaving via React unmount with pending work —
        // skip if we already cleared the draft (completion path).
        //
        // ⚠ TCK-483 — un REF, pas l'état. Cette fermeture appartient à un effet
        // dont la liste de dépendances est `[hydrated]` : elle capture donc
        // `completing` tel qu'il valait à l'hydratation — `false`, pour toujours.
        // Le garde était écrit, juste, et ne gardait rien.
        //
        // ⚠⚠ Et le remède n'est PAS d'ajouter `completing` aux dépendances :
        // mesuré sur un parcours complet (hydratation → finalisation →
        // démontage), `[hydrated, completing]` fait passer l'effet de 1 à 3
        // exécutions et ses nettoyages de 1 à 3 — donc trois `flush()`, et un
        // « Progression sauvegardée » qui part dès le clic sur *Terminer*, avant
        // que la personne n'ait quitté quoi que ce soit (deux sur le parcours).
        // Le ref laisse le compte à 1, et garde en prime le cas que la dépendance
        // ne couvre pas : le démontage qui SUIT la finalisation.
        if (!finalisationRef.current) {
          toast.add({ title: t('savedToastTitle'), description: t('savedToastBody'), type: 'success' });
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
    // TCK-483 — armé AVANT le premier `await` : le démontage peut survenir
    // pendant `onComplete` (une navigation) aussi bien qu'après.
    finalisationRef.current = true;
    try {
      // ── TCK-475, SITE 2 (finalisation) ──────────────────────────────────────
      // `flush()` était appelé pour son seul effet de bord, son sort jeté. Ce
      // site n'annonçait donc PAS un succès faux — il n'annonçait rien du tout,
      // ce qui est le même défaut d'un cran plus loin : l'échec enchaînait sur
      // `onComplete` puis sur `clear()`, qui DÉTRUIT le brouillon côté serveur.
      // Une écriture refusée ici dit que le réseau vient de refuser un PUT, et
      // `onComplete` emprunte exactement le même chemin. On s'arrête avant, en
      // disant quoi faire : le bouton reste là, la saisie reste en mémoire, et
      // le brouillon serveur — périmé mais présent — n'est pas supprimé.
      const resultat = await flush();
      if (!resultat.ok) {
        // TCK-483 — la finalisation n'a pas eu lieu : `clear()` n'est pas passé,
        // le brouillon serveur vit toujours. Le garde se désarme, sans quoi le
        // toast de sauvegarde resterait éteint pour le reste de la session.
        finalisationRef.current = false;
        toast.add({
          title: t('completionFailedToastTitle'),
          description: t('completionFailedToastBody'),
          type: 'error',
        });
        return;
      }
      await onComplete(data);
      await clear();
    } finally {
      setCompleting(false);
    }
  }, [canAdvance, isLast, totalSteps, flush, onComplete, data, clear, toast, t]);

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
