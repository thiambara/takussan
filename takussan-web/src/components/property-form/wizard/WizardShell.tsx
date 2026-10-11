'use client';

import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useFloatingDockSlot } from '@/components/floating-dock';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-464 — la coquille du parcours de publication : progression, transition, navigation.
 *
 * Elle ne connaît RIEN du domaine : ni bien, ni adresse, ni prix. Elle reçoit des étapes déjà
 * traduites et déjà validées par l'appelant, et ne décide que du mouvement. C'est ce qui la rend
 * testable sans formulaire.
 *
 * TCK-631 (piste 6) — la coquille occupe tout l'écran (la console retire sa chrome sur cette
 * route, cf. `layout/plein-ecran.ts`) et se compose de quatre zones :
 *
 * - l'**en-tête** (`entete`), fourni par l'appelant — la marque, l'état du brouillon, la sortie ;
 * - la **question**, seule zone défilante, que précède « Partie N sur 3 · … » ;
 * - le **pied**, hors du défilement : la progression en parties, « Précédent », « Continuer » ;
 * - l'**aperçu** : une colonne à droite dès `lg` (`apercu`), une barre sous l'en-tête en dessous
 *   (`barreApercu`). Le rail d'étapes et la barre « Étape 1 sur 6 » disparaissent — ils disaient
 *   deux fois la même chose ; la liste de l'aperçu reprend le rôle du rail.
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
  /** TCK-631 — l'index de la PARTIE (dans `parts`) à laquelle l'étape appartient. */
  readonly part?: number;
};

export type WizardShellProps = {
  readonly steps: readonly WizardStepDef[];
  readonly index: number;
  readonly direction: 1 | -1;
  readonly onNavigate: (next: number, direction: 1 | -1) => void;
  readonly onFinish: () => void;
  readonly finishLabel: string;
  readonly busy?: boolean;
  /**
   * TCK-631 — les libellés des parties qui regroupent les étapes (« Le bien », « Les détails »,
   * « L'annonce »). Absent, le parcours n'a qu'une partie et la progression un seul segment.
   */
  readonly parts?: readonly string[];
  readonly entete?: React.ReactNode;
  /** La colonne d'aperçu, montrée dès `lg`. */
  readonly apercu?: React.ReactNode;
  /** L'aperçu replié en barre, montré SOUS `lg`. */
  readonly barreApercu?: React.ReactNode;
  /** Les alertes du parcours (erreur globale, brouillon refusé…), au-dessus de la question. */
  readonly bandeau?: React.ReactNode;
};

export function WizardShell({
  steps, index, direction, onNavigate, onFinish, finishLabel, busy = false, parts,
  entete, apercu, barreApercu, bandeau,
}: WizardShellProps) {
  const t = useTranslations('property.wizard');
  const etape = steps[index];
  const derniere = index === steps.length - 1;
  const peutAvancer = etape.canAdvance !== false;
  const partieCourante = etape.part ?? 0;
  const segments = parts ?? [null];

  // Le pied tient le bas de l'écran pendant tout le parcours : il revendique le bord bas auprès
  // du dock, sans quoi un élément flottant se posait sur « Continuer » à 390 px (mesuré le
  // 2026-09-16). Hauteur : bordure + barre (4) + libellés des parties (22) + `pt-3` + bouton `lg`
  // (40) + `pb-4`.
  const pied = useFloatingDockSlot({
    id: 'property-wizard-footer',
    corner: 'bottom-full',
    height: 97,
    safeAreaInset: 'calc(1rem + env(safe-area-inset-bottom))',
  });

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

  /**
   * Le remplissage d'un segment : la part de SES étapes déjà atteintes, courante comprise. Une
   * partie franchie est pleine, une partie à venir est vide.
   */
  const remplissage = (partie: number) => {
    const siennes = steps.flatMap((s, i) => ((s.part ?? 0) === partie ? [i] : []));
    if (siennes.length === 0) return 0;
    return siennes.filter((i) => i <= index).length / siennes.length;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {entete}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {barreApercu ? <div className="shrink-0 lg:hidden">{barreApercu}</div> : null}
          {bandeau ? <div className="shrink-0 px-4 pt-4 sm:px-8 lg:px-12 xl:px-14">{bandeau}</div> : null}

          {/* ── Corps : LA SEULE zone défilante (AC9) ── */}
          <div data-wizard-scroll className="min-h-0 flex-1 overflow-y-auto">
            <div
              key={etape.id}
              className={cn(
                'mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-8 lg:pt-9 xl:px-14',
                direction > 0 ? 'wizard-step-in-forward' : 'wizard-step-in-back',
              )}
            >
              {parts ? (
                <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {t('partPosition', {
                    current: partieCourante + 1,
                    total: parts.length,
                    label: parts[partieCourante],
                  })}
                </p>
              ) : null}
              <h1
                ref={titreRef}
                tabIndex={-1}
                // ⚠ Pas de `focus:outline-none` nu (motif de `SuperAdminShell`) : là-bas la cible
                // est une grande zone de contenu atteinte une fois par session via un lien
                // d'évitement — ici c'est un titre atteint par une action clavier répétée (jusqu'à
                // cinq fois dans un parcours), et retirer l'indicateur visuel priverait exactement
                // le moment où quelqu'un au clavier veut confirmer où le focus est allé. `--ring`
                // (#a85332) mesure ≈5,07:1 sur `--background` (#fcf9f3), au-dessus du seuil
                // non-texte de 3:1 : pas de `ring-offset` nécessaire.
                //
                // TCK-631 — `h1` et non plus `h2` : la page ne porte plus de titre au-dessus du
                // parcours (il disait « Publier un bien » une troisième fois). La question est le
                // titre de la route.
                className="font-display text-[1.625rem] leading-8 font-bold tracking-tight text-balance text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-4xl sm:leading-10"
              >
                {etape.title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
                {etape.subtitle}
              </p>
              <div className="mt-7 space-y-7">{etape.body}</div>
            </div>
          </div>

          {/* ── Pied : HORS de la zone défilante. Le moyen d'avancer ne sort jamais de l'écran. ── */}
          <div
            data-wizard-footer
            style={{ paddingBottom: pied.paddingBottom }}
            className="shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          >
            <div
              role="progressbar"
              aria-valuenow={index + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuetext={t('position', { current: index + 1, total: steps.length })}
              aria-label={t('progressLabel')}
              className="-mt-px grid gap-1.5 px-4 sm:px-8 xl:px-14"
              style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
            >
              {segments.map((_, partie) => (
                <div key={partie} className="h-1 overflow-hidden rounded-full bg-muted">
                  {/*
                    420 ms : PLUS LENT que la transition d'étape (300 ms), délibérément. La barre
                    finit après, donc on la voit avancer — si elle finissait avant, l'œil serait
                    déjà parti.
                  */}
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                      partie < partieCourante ? 'bg-foreground' : 'bg-primary',
                    )}
                    style={{
                      width: `${(parts ? remplissage(partie) : (index + 1) / steps.length) * 100}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            {parts ? (
              <div
                aria-hidden="true"
                className="grid gap-1.5 px-4 pt-1.5 text-xs text-muted-foreground sm:px-8 xl:px-14"
                style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}
              >
                {parts.map((libelle, partie) => (
                  <span
                    key={libelle}
                    className={cn('truncate', partie === partieCourante && 'font-semibold text-foreground')}
                  >
                    {libelle}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-2 px-4 pt-3 sm:px-8 xl:px-14">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={index === 0 || busy}
                onClick={() => onNavigate(index - 1, -1)}
                className="-ml-2.5"
              >
                {t('back')}
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {etape.skippable && !derniere ? (
                  <Button type="button" variant="ghost" size="lg" disabled={busy}
                    onClick={() => onNavigate(index + 1, 1)}>
                    {t('skip')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  className="min-w-36 sm:min-w-44"
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

        {apercu ? (
          <aside
            aria-label={t('preview.label')}
            className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-border bg-muted/40 lg:block xl:w-[25rem]"
          >
            <div className="flex flex-col gap-4 p-6 xl:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {t('preview.label')}
                </p>
                <span className="text-xs text-muted-foreground">{t('preview.hint')}</span>
              </div>
              {apercu}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
