'use client';

import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-464 — la coquille du parcours de publication : progression, transition, navigation.
 *
 * Elle ne connaît RIEN du domaine : ni bien, ni adresse, ni prix. Elle reçoit des étapes déjà
 * traduites et déjà validées par l'appelant, et ne décide que du mouvement. C'est ce qui la rend
 * testable sans formulaire.
 *
 * ⚠ Elle ne réutilise PAS `WizardReprenable` (TCK-250) : le chrome de ce composant — barre,
 * pastilles, boutons Précédent/Suivant — est exactement ce que ce ticket remplace. La partie
 * réutilisable de TCK-250, `useWizardDraft`, l'est en revanche (cf. Task 12).
 *
 * ⚠ Aucun `useCallback` / `useMemo` : le React Compiler s'en charge (ADR-0015), et une
 * mémoïsation manuelle fait ABANDONNER la compilation de tout le composant.
 *
 * ⚠ Contrat de hauteur (AC9) : la coquille remplit `h-full` de son parent (`min-h-0` sur toute la
 * chaîne flex) — jamais une hauteur devinée (`min-h-[calc(100dvh-Npx)]`). Un `min-h-*` n'est
 * qu'un plancher : si le corps déborde, c'est le CONTENEUR qui grandit, pas la zone défilante qui
 * apparaît — et c'est alors la page qui défile, en emportant le pied avec elle. Le pied ne reste
 * hors du flux défilant que si l'ancêtre qui monte `<WizardShell>` lui donne une boîte bornée
 * (`h-dvh`, `h-screen`, ou un `min-h-0 flex-1` qui remonte jusqu'à une telle boîte) — exactement
 * le motif déjà en place dans `AppShell`/`AdminShell` (`<main className="min-h-0 flex-1
 * overflow-y-auto">`). C'est la responsabilité de la page qui assemble le parcours (Task 9), pas
 * de cette coquille — mais la coquille, elle, doit honorer la boîte qu'on lui donne plutôt que
 * d'en redevenir une par coïncidence.
 */
export type WizardStepDef = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly body: React.ReactNode;
  readonly canAdvance?: boolean;
  readonly skippable?: boolean;
};

export type WizardShellProps = {
  readonly steps: readonly WizardStepDef[];
  readonly index: number;
  readonly direction: 1 | -1;
  readonly onNavigate: (next: number, direction: 1 | -1) => void;
  readonly onFinish: () => void;
  readonly finishLabel: string;
  readonly busy?: boolean;
  readonly footerExtra?: React.ReactNode;
};

export function WizardShell({
  steps, index, direction, onNavigate, onFinish, finishLabel, busy = false, footerExtra,
}: WizardShellProps) {
  const t = useTranslations('property.wizard');
  const etape = steps[index];
  const derniere = index === steps.length - 1;
  const peutAvancer = etape.canAdvance !== false;

  const titreRef = useRef<HTMLHeadingElement>(null);
  // Premier rendu excepté : le focus ne se déplace que sur un CHANGEMENT d'étape, jamais au
  // montage — sans quoi on arracherait l'utilisateur de là où il vient d'arriver sur la page.
  // ⚠ On compare une IDENTITÉ mémorisée (`dernierId`), pas un compteur de passages d'effet : sous
  // le Strict Mode de React (actif ici, `next.config.ts` ne désactive pas `reactStrictMode`), un
  // effet de montage s'exécute deux fois sur la même fibre en développement. Un booléen
  // « premier passage » passerait à `true` dès la première passe et volerait le focus dès la
  // seconde, sur le MÊME `etape.id` — exactement ce que ce garde-fou existe pour empêcher. Une
  // comparaison d'identité relit la même valeur à la seconde passe et ne focalise pas : elle est
  // insensible au nombre d'exécutions de l'effet. `etape.id` en dépendance, pas `index` : c'est
  // l'identité de l'étape affichée qui doit changer, comme pour le remount de `key` juste en
  // dessous.
  const dernierId = useRef<string | null>(null);
  useEffect(() => {
    if (dernierId.current !== null && dernierId.current !== etape.id) {
      titreRef.current?.focus();
    }
    dernierId.current = etape.id;
  }, [etape.id]);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row lg:gap-10">
      {/* ── Rail d'étapes : desktop seulement. Sous lg, la barre de progression le remplace. ── */}
      <nav aria-label={t('railLabel')} className="hidden w-56 shrink-0 lg:block">
        <ol className="sticky top-24 space-y-1">
          {steps.map((s, i) => {
            const franchie = i < index;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!franchie}
                  onClick={() => onNavigate(i, -1)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    i === index && 'bg-muted font-semibold text-foreground',
                    franchie && 'text-muted-foreground hover:bg-muted',
                    !franchie && i !== index && 'cursor-default text-muted-foreground/50',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-xs',
                      i === index && 'border-primary bg-primary text-primary-foreground',
                      franchie && 'border-accent bg-accent/15 text-accent',
                      !franchie && i !== index && 'border-border',
                    )}
                  >
                    {franchie ? '✓' : i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Progression ── */}
        <div className="shrink-0 pb-4">
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === 0 || busy}
              onClick={() => onNavigate(index - 1, -1)}
              aria-label={t('back')}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <span className="text-xs font-semibold text-muted-foreground">
              {t('position', { current: index + 1, total: steps.length })}
            </span>
            {footerExtra}
          </div>
          <div
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label={t('progressLabel')}
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            {/*
              420 ms : PLUS LENT que la transition d'étape (300 ms), délibérément. La barre finit
              après, donc on la voit avancer — si elle finissait avant, l'œil serait déjà parti.
            */}
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Corps : LA SEULE zone défilante (AC9) ── */}
        <div data-wizard-scroll className="min-h-0 flex-1 overflow-y-auto">
          <div
            key={etape.id}
            className={cn(
              'mx-auto max-w-xl pb-6',
              direction > 0 ? 'wizard-step-in-forward' : 'wizard-step-in-back',
            )}
          >
            <h2
              ref={titreRef}
              tabIndex={-1}
              // ⚠ Pas de `focus:outline-none` nu (motif de `SuperAdminShell`) : là-bas la cible
              // est une grande zone de contenu atteinte une fois par session via un lien
              // d'évitement — ici c'est un titre de section atteint par une action clavier
              // répétée (jusqu'à cinq fois dans un parcours), et retirer l'indicateur visuel
              // priverait exactement le moment où quelqu'un au clavier veut confirmer où le
              // focus est allé. `--ring` (#a85332) mesure ≈5,07:1 sur `--background` (#fcf9f3),
              // au-dessus du seuil non-texte de 3:1 : pas de `ring-offset` nécessaire, comme pour
              // `FOCUS_RING` d'`AppSidebar` sur la même palette claire.
              className="font-display text-2xl font-bold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {etape.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{etape.subtitle}</p>
            <div className="mt-6 space-y-5">{etape.body}</div>
          </div>
        </div>

        {/* ── Pied : HORS de la zone défilante. Le moyen d'avancer ne sort jamais de l'écran. ── */}
        <div
          data-wizard-footer
          className="shrink-0 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <div className="mx-auto flex max-w-xl items-center gap-3">
            {etape.skippable && !derniere ? (
              <Button type="button" variant="ghost" size="lg" disabled={busy}
                onClick={() => onNavigate(index + 1, 1)}>
                {t('skip')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={busy || !peutAvancer}
              onClick={() => (derniere ? onFinish() : onNavigate(index + 1, 1))}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <span>{derniere ? finishLabel : t('continue')}</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
