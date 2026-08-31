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
 * - un RAIL D'ÉTAPES vertical à partir de `lg`, remplacé sous cette largeur par
 *   un compteur et une barre — jamais les deux à la fois : la coque affichait
 *   une barre de progression ET des pastilles numérotées, qui disaient la même
 *   chose deux fois, au-dessus d'un titre d'étape qui la disait une troisième,
 * - per-step body provided by the consumer (via `steps[i].render`),
 * - bottom Précédent / Suivant / Terminer navigation,
 * - silent autosave (debounced 800ms by default — see `useWizardDraft`),
 * - "progress saved" toast when navigating away mid-flow.
 *
 * ⚠ La liste d'étapes était HORIZONTALE et `flex-wrap` : son pli dépendait de la
 * longueur des traductions, donc il ne tombait pas au même endroit en `fr`, `en`
 * et `wo`. En colonne, il n'y a plus de pli à placer. Les animations d'entrée
 * réemploient `.wizard-step-in-*` (TCK-464) — dont la garde
 * `prefers-reduced-motion` de `globals.css` nomme déjà les classes.
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
  // La DIRECTION du dernier déplacement — elle porte le sens de l'animation
  // d'entrée (`.wizard-step-in-forward` / `-back`, TCK-464) : on avance,
  // l'étape entre par la droite ; on revient, par la gauche.
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
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
    setDirection('back');
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(async () => {
    if (!canAdvance) return;
    if (!isLast) {
      setDirection('forward');
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
      className={cn(
        'mx-auto grid w-full max-w-4xl gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14',
        className,
      )}
    >
      {/* ── Rail d'étapes ─────────────────────────────────────────────────────
          Vertical, et c'est le point de la refonte : la liste était horizontale
          et `flex-wrap`, donc elle passait à la ligne dès que les intitulés
          étaient longs — « 1 VOUS PUBLIEZ EN TANT QUE… · 2 VOTRE ESPACE · 3
          MODE DE PAIEMENT » puis « 4 RÉCAPITULATIF » seul sur sa ligne. Un pli
          qui dépend de la LONGUEUR DES TRADUCTIONS se déplace à chaque locale :
          `wo` et `en` ne cassaient pas au même endroit que `fr`. En colonne, il
          n'y a plus de pli à placer. */}
      <aside className="hidden lg:block">
        <ol className="sticky top-8 flex flex-col">
          {steps.map((step, idx) => {
            const isActive = idx === stepIndex;
            const isDone = idx < stepIndex;
            const isLastBadge = idx === steps.length - 1;

            return (
              <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
                {!isLastBadge ? (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px',
                      isDone ? 'bg-primary/40' : 'bg-border',
                    )}
                  />
                ) : null}

                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums',
                    'transition-colors duration-200 ease-out',
                    isActive && 'border-primary bg-primary text-primary-foreground',
                    isDone && 'border-primary/40 bg-primary/10 text-primary',
                    !isActive && !isDone && 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="size-3" /> : idx + 1}
                </span>

                <span
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'pt-0.5 text-sm leading-snug transition-colors duration-200 ease-out',
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.title}
                </span>
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="flex min-w-0 flex-col gap-7">
        {/* Compteur + barre : la version COMPACTE du rail, pour les largeurs où
            il n'a pas sa place. Les deux ne coexistent jamais — deux
            indicateurs de progression simultanés (barre + pastilles) disaient
            la même chose deux fois. */}
        <div className="flex flex-col gap-2 lg:hidden">
          <p className="text-sm font-medium text-muted-foreground tabular-nums">
            {t('progressAriaLabel', { current: stepIndex + 1, total: totalSteps })}
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={t('progressAriaLabel', { current: stepIndex + 1, total: totalSteps })}
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <header className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-[1.75rem]">
            {current.title}
          </h2>
          {current.subtitle ? (
            <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
              {current.subtitle}
            </p>
          ) : null}
        </header>

        {/* Le corps d'étape n'est PLUS dans une carte : ses propres options en
            sont déjà (`ChoiceCard`), et une carte dans une carte n'a jamais de
            raison d'être. La clé de rendu porte l'étape, ce qui rejoue la
            transition d'entrée à chaque changement — un signal d'état, pas une
            décoration : 200 ms, et rien du tout en mouvement réduit. */}
        <div
          key={current.id}
          className={direction === 'forward' ? 'wizard-step-in-forward' : 'wizard-step-in-back'}
        >
          {!hydrated ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3">
              <span className="sr-only">{t('loading')}</span>
              <div className="h-11 w-full rounded-xl bg-muted motion-safe:animate-pulse" />
              <div className="h-11 w-full rounded-xl bg-muted motion-safe:animate-pulse" />
            </div>
          ) : (
            current.render({ data, setData })
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={handlePrevious}
            disabled={stepIndex === 0 || completing}
            className={cn(stepIndex === 0 && 'invisible')}
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
      </div>
    </section>
  );
}
