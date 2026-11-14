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
  /**
   * TCK-2600 — l'écran d'accueil du parcours (« Publiez votre bien gratuitement ») : dans le cadre
   * d'entrée, ni « Partie 1 sur 3 » au-dessus, et le titre de l'écran d'entrée (maquette a-0).
   */
  readonly accueil?: boolean;
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
  /**
   * TCK-2601 (AC5) — le nœud où la feuille de compte se rend en PANNEAU dès `xl` (1280 px) : à la
   * place de l'étape et du pied, l'aperçu restant à droite. Le nœud est toujours monté (la feuille
   * le lit pour son portail) ; il ne se montre, et l'étape et le pied ne se cachent, que dès `xl`
   * quand `panneauOuvert` — sous 1280 px la feuille reste un dialogue, et rien ne change ici.
   */
  readonly refDuPanneau?: React.Ref<HTMLDivElement>;
  readonly panneauOuvert?: boolean;
  /**
   * TCK-2600 — le cadre des écrans d'entrée (`/publish`, sans compte), dès `lg` : le `GabaritBureau`
   * de la maquette `app-entree-publier`. Une grille centrée de 1 112 px, la question dans une colonne
   * de 560 px, l'aperçu dans une colonne de 400 px qui reste en vue, et le pied aligné sur la même
   * grille (la progression et les gestes sous la question, `noteDuPied` sous l'aperçu). Absent,
   * rien ne change : `/app/properties/new` garde son cadre plein écran (aucune maquette ne le
   * redessine, et la colonne de `/app` n'a pas la largeur de la grille).
   */
  readonly cadreDEntree?: boolean;
  /** Ce que le pied dit sous l'aperçu, dans le cadre d'entrée (dès `lg`). */
  readonly noteDuPied?: React.ReactNode;
};

/**
 * Les gestes du pied dans le cadre d'entrée, dès `lg` : le `BoutonE` des écrans d'entrée (44 px, 15 px
 * à 1,5, 600, ronds, écart de 8, sans le filet transparent de `Button`). Le fantôme de la maquette est
 * en encre à 80 % : le produit garde l'encre pleine, une encre de texte ne s'atténue pas par l'opacité
 * (TCK-658, `encre-sans-alpha.contraste.test.ts`).
 */
/**
 * TCK-2819 — les gestes du pied SOUS `lg`, aux deux entrées (`/publish` et `/app/properties/new`) : le
 * `PiedAssistant` de la maquette `app-entree-publier` (`BoutonE` « grand » : 48 px, 16 px / 600, ronds,
 * sans le filet transparent de `Button`). Dès `lg`, rien ne change : le cadre d'entrée a ses gestes
 * (`GESTE_D_ENTREE`), le cadre plein écran de `/app` garde les siens.
 */
const GESTE_DU_TELEPHONE = 'max-lg:h-12 max-lg:gap-2 max-lg:rounded-full max-lg:border-0 max-lg:text-action max-lg:leading-normal max-lg:font-semibold';

const GESTE_D_ENTREE = 'lg:h-11 lg:gap-2 lg:rounded-full lg:border-0 lg:px-5 lg:text-corps lg:leading-normal lg:font-semibold';

/**
 * TCK-2600 — la grille du `GabaritBureau` de la maquette, dès `lg`. Ses mesures sont des px FIXES
 * dans la maquette (560, 400, 1 112), que la densité du bureau ne réduit pas : elles s'écrivent en
 * `rem` (35, 25, 69,5), hors de l'échelle ; la marge `px-8` et les espacements, eux, suivent
 * l'échelle comme dans la maquette.
 */
// `minmax(0,35rem)` : à 1024 px, la grille n'a que 6 px de marge ; une barre de défilement classique
// (15 px, Windows) dans la zone défilante la ferait déborder — la colonne de la question cède alors
// quelques pixels au lieu de faire défiler la page de côté.
const GRILLE_D_ENTREE = 'lg:mx-auto lg:grid lg:w-full lg:max-w-[69.5rem] lg:grid-cols-[minmax(0,35rem)_25rem] lg:justify-between lg:px-8';

/**
 * Une rangée du cadre d'entrée (le corps, puis le pied) : la question — ou la progression et les
 * gestes — dans la colonne de 560 px, l'aperçu — ou la note du pied — dans celle de 400 px. Hors du
 * cadre d'entrée, rien n'enveloppe : le DOM de `/app/properties/new` reste celui d'avant TCK-2600.
 */
function GrilleDEntree({
  active, className, apercu, children,
}: {
  readonly active: boolean;
  readonly className: string;
  readonly apercu: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className={cn(GRILLE_D_ENTREE, className)}>
      <div className="min-w-0">{children}</div>
      {apercu}
    </div>
  );
}

export function WizardShell({
  steps, index, direction, onNavigate, onFinish, finishLabel, busy = false, parts,
  entete, apercu, barreApercu, bandeau, refDuPanneau, panneauOuvert = false, cadreDEntree = false, noteDuPied,
}: WizardShellProps) {
  const t = useTranslations('property.wizard');
  const etape = steps[index];
  const derniere = index === steps.length - 1;
  const peutAvancer = etape.canAdvance !== false;
  const partieCourante = etape.part ?? 0;
  const segments = parts ?? [null];

  // Le pied tient le bas de l'écran pendant tout le parcours : il revendique le bord bas auprès
  // du dock, sans quoi un élément flottant se posait sur « Continuer » à 390 px (mesuré le
  // 2026-09-16). Hauteur au téléphone (TCK-2819, le `PiedAssistant` de la maquette, 117 px) :
  // bordure + `pt-2.5` + barre (4) + libellés des parties (22) + `pt-3` + geste de 48 + `pb-1` + `pb-4`.
  // Dès `lg` le pied est plus bas (97 px) : la place réservée en trop n'y gêne rien.
  const pied = useFloatingDockSlot({
    id: 'property-wizard-footer',
    corner: 'bottom-full',
    height: 117,
    safeAreaInset: 'calc(var(--spacing) * 4 + env(safe-area-inset-bottom))',
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
          {/* Maquette a-0 (téléphone) : le départ n'a pas encore de résumé — rien n'a été dit. */}
          {barreApercu && !etape.accueil ? <div className="shrink-0 lg:hidden">{barreApercu}</div> : null}
          {bandeau ? <div className="shrink-0 px-4 pt-4 sm:px-8 lg:px-12 xl:px-14">{bandeau}</div> : null}

          {/* ── Corps : LA SEULE zone défilante (AC9) ── */}
          <div data-wizard-scroll className="min-h-0 flex-1 overflow-y-auto">
            <GrilleDEntree
              active={cadreDEntree}
              className="lg:pt-10 lg:pb-12"
              apercu={
                apercu ? (
                  <aside aria-label={t('preview.label')} className="hidden lg:block">
                    {/* Maquette : l'aperçu reste en vue à 104 px du haut de la page, sous la barre de 64. */}
                    <div className="sticky top-[calc(6.5rem-var(--spacing)*16)] flex flex-col gap-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">{t('preview.label')}</p>
                        <span className="text-ui text-muted-foreground">{t('preview.hint')}</span>
                      </div>
                      {apercu}
                    </div>
                  </aside>
                ) : null
              }
            >
              <div
                ref={refDuPanneau}
                data-wizard-panneau=""
                data-cadre-d-entree={cadreDEntree ? '' : undefined}
                className={cn(
                  panneauOuvert ? 'hidden xl:block' : 'hidden',
                  // Le panneau de compte (TCK-2601) se pose dans la colonne de la question : celle de la
                  // grille d'entrée, ou celle du cadre plein écran.
                  !cadreDEntree && 'mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-8 lg:pt-9 xl:px-14',
                )}
              />
              <div
                key={etape.id}
                className={cn(
                  'mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-8 lg:pt-9 xl:px-14',
                  cadreDEntree && 'lg:mx-0 lg:max-w-none lg:p-0 xl:px-0',
                  direction > 0 ? 'wizard-step-in-forward' : 'wizard-step-in-back',
                  panneauOuvert && 'xl:hidden',
                )}
              >
                {parts && !(cadreDEntree && etape.accueil) ? (
                  <p
                    className={cn(
                      'mb-2 text-[calc(var(--spacing)*2.75)] font-semibold tracking-[0.12em] text-muted-foreground uppercase',
                      cadreDEntree && 'lg:text-xs',
                    )}
                  >
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
                  className={cn(
                    'font-display font-semibold tracking-titre text-balance text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-4xl sm:leading-10',
                    // TCK-2819 (lot 2) — maquette, téléphone : la question en 26 px, 600, interligne 1,15 ;
                    // l'accueil (a-0) en 28 px. Aux deux entrées : un seul assistant.
                    etape.accueil ? 'text-affiche-28 leading-[1.12]' : 'text-affiche-26 leading-[1.15]',
                    // Maquette a-1 à a-5 : 32 px, 600, interligne 1,1 ; a-0 (l'accueil) : 36 px, 1,08.
                    cadreDEntree &&
                      (etape.accueil
                        ? 'lg:text-affiche-32 lg:leading-[1.08] lg:font-semibold lg:tracking-titre'
                        : 'lg:text-affiche-32 lg:leading-[1.1] lg:font-semibold lg:tracking-titre'),
                  )}
                >
                  {etape.title}
                </h1>
                <p
                  className={cn(
                    // TCK-2819 (lot 2) — la phrase de la question, 15 px au téléphone (maquette `TitreQuestion`).
                    'mt-1.5 text-corps leading-snug text-pretty text-muted-foreground sm:mt-2 sm:text-base sm:leading-relaxed',
                    cadreDEntree &&
                      (etape.accueil ? 'lg:mt-3 lg:text-titre-court lg:leading-normal' : 'lg:mt-1.5 lg:text-corps lg:leading-snug'),
                  )}
                >
                  {etape.subtitle}
                </p>
                <div className="mt-7 space-y-7">{etape.body}</div>
              </div>
            </GrilleDEntree>
          </div>

          {/* ── Pied : HORS de la zone défilante. Le moyen d'avancer ne sort jamais de l'écran. ── */}
          <div
            data-wizard-footer
            style={{ paddingBottom: pied.paddingBottom }}
            className={cn(
              // TCK-2819 — sous `lg`, le `Pied` de la maquette : carte, ombre portée vers le haut, `pt-2.5`.
              // L'ombre (le jeton `--shadow-barre-collante`, celle du `Pied`) porte `max-lg:` : un
              // `lg:shadow-none` laisserait des ombres transparentes calculées.
              'shrink-0 border-t border-border bg-card pt-2.5 max-lg:shadow-barre-collante',
              'lg:pt-0',
              cadreDEntree
                ? 'lg:bg-card'
                : 'lg:bg-background/95 lg:backdrop-blur lg:supports-[backdrop-filter]:bg-background/80',
              panneauOuvert && 'xl:hidden',
            )}
          >
            <GrilleDEntree
              active={cadreDEntree}
              className="lg:items-center lg:pt-3"
              apercu={<div className="hidden text-ui leading-snug text-pretty text-muted-foreground lg:block">{noteDuPied}</div>}
            >
              <div
                role="progressbar"
                aria-valuenow={index + 1}
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuetext={t('position', { current: index + 1, total: steps.length })}
                aria-label={t('progressLabel')}
                className={cn('grid gap-1.5 px-4 sm:px-8 lg:-mt-px xl:px-14', cadreDEntree && 'lg:mt-0 lg:px-0 xl:px-0')}
                style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
              >
                {segments.map((_, partie) => (
                  // Sous `lg` (maquette `Segments`) : le rail en `border`, chaque partie atteinte en `primary`.
                  <div key={partie} className="h-1 overflow-hidden rounded-full bg-border lg:bg-muted">
                    {/*
                      420 ms : PLUS LENT que la transition d'étape (300 ms), délibérément. La barre
                      finit après, donc on la voit avancer — si elle finissait avant, l'œil serait
                      déjà parti.
                    */}
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                        partie < partieCourante ? 'bg-primary lg:bg-foreground' : 'bg-primary',
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
                  className={cn('grid gap-1.5 px-4 pt-1.5 text-xs text-muted-foreground sm:px-8 xl:px-14', cadreDEntree && 'lg:px-0 xl:px-0')}
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

              {/* Sous 390 px, l'écart passe de 12 à 8 : a-4 (trois gestes) finissait à 346 px sur 360, dans la marge. */}
              <div className={cn('flex items-center gap-3 px-4 pt-3 pb-1 max-[389px]:gap-2 sm:px-8 lg:gap-2 lg:pb-0 xl:px-14', cadreDEntree && 'lg:px-0 xl:px-0')}>
                {/*
                  Maquette a-0 : le départ n'a pas de « Précédent » (rien avant lui), plutôt qu'un geste
                  éteint — au téléphone aux deux entrées (TCK-2819), dès `lg` dans le cadre d'entrée seul.
                */}
                {cadreDEntree && index === 0 ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    disabled={index === 0 || busy}
                    onClick={() => onNavigate(index - 1, -1)}
                    className={cn(
                      GESTE_DU_TELEPHONE,
                      'max-lg:px-2 lg:-ml-2.5',
                      index === 0 && 'max-lg:hidden',
                      cadreDEntree && [GESTE_D_ENTREE, 'lg:-ml-5'],
                    )}
                  >
                    {t('back')}
                  </Button>
                )}
                {/* Maquette a-4 : « Plus tard » touche « Continuer » (aucun écart entre eux) dès `lg`. */}
                <div
                  className={cn(
                    'ml-auto flex items-center gap-3 max-[389px]:gap-2 lg:gap-2',
                    index === 0 && 'max-lg:w-full',
                    cadreDEntree && 'lg:gap-0',
                  )}
                >
                  {etape.skippable && !derniere ? (
                    <Button type="button" variant="ghost" size="lg" disabled={busy}
                      className={cn(GESTE_DU_TELEPHONE, 'max-lg:px-2', cadreDEntree && GESTE_D_ENTREE)}
                      onClick={() => onNavigate(index + 1, 1)}>
                      {t('skip')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="lg"
                    className={cn(
                      GESTE_DU_TELEPHONE,
                      // Maquette : 172 px de large à côté de « Précédent » seul, 136 avec « Plus tard », toute
                      // la ligne au départ. Sous 390 px, les trois gestes côte à côte ne tiennent qu'à la
                      // largeur de leur texte : « Continuer » cède son minimum (a-4 à 360, TCK-2819).
                      'max-lg:px-6 sm:min-w-44',
                      index === 0
                        ? 'max-lg:w-full'
                        : etape.skippable && !derniere
                          ? 'min-w-[8.5rem] max-[389px]:min-w-0 max-[389px]:px-5'
                          : 'min-w-[10.75rem]',
                      cadreDEntree && [GESTE_D_ENTREE, 'lg:min-w-[11rem]'],
                    )}
                    disabled={busy || !peutAvancer}
                    onClick={() => (derniere ? onFinish() : onNavigate(index + 1, 1))}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        <span>{t('saving')}</span>
                      </>
                    ) : derniere ? (
                      // Le libellé est le texte du bouton lui-même, sans enveloppe (le `BoutonE` de la
                      // maquette) : le relevé apparie alors le texte au bouton entier.
                      finishLabel
                    ) : (
                      t('continue')
                    )}
                  </Button>
                </div>
              </div>
            </GrilleDEntree>
          </div>
        </div>

        {apercu && !cadreDEntree ? (
          <aside
            aria-label={t('preview.label')}
            className="hidden w-88 shrink-0 overflow-y-auto border-l border-border bg-muted/40 lg:block xl:w-100"
          >
            <div className="flex flex-col gap-4 p-6 xl:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[calc(var(--spacing)*2.75)] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
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
