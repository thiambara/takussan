'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { WelcomeIllustration } from './WelcomeIllustration';

/**
 * TCK-251 — A single welcome slide.
 *
 * `illustration` is a free-form node, rendered decorative (`aria-hidden`)
 * above the title, inside a box the modale both SIZES and PAINTS (`bg-muted`;
 * on a phone the height the screen leaves, between 9rem and 20rem; 11rem from
 * `sm`; hidden on screens under 30rem tall) — so nothing the
 * node does or fails to do can leave that height blank. Typically
 * `<WelcomeIllustration icon={…} />`, the shared drawing (TCK-567), with an
 * icon that says what the slide is about.
 *
 * Optional for the caller, NEVER absent on screen: a slide without one gets
 * `ILLUSTRATION_PAR_DEFAUT`. TCK-251 puts an « illustration au-dessus » on
 * every slide, and a slide without it left the fullscreen phone modale with
 * its free height and nothing to fill it — the void reported on 2026-09-23.
 */
export type WelcomeSlide = {
  illustration?: ReactNode;
  title: string;
  body: string;
};

export type WelcomeModalProps = {
  /** Whether the modale is currently displayed. */
  open: boolean;
  /** Slides to render in order. The component is built around 1–3 slides. */
  slides: WelcomeSlide[];
  /** Called when the user finishes the last slide via the primary CTA. */
  onComplete: () => void;
  /**
   * Called when the user dismisses without completing — via the "Passer"
   * link, the close button, an Escape press, or a backdrop click.
   * Per TCK-251 AC1/AC2, dismissal is treated as "seen" by the consumer.
   */
  onSkip: () => void;
};

/**
 * TCK-567 (M10) — l'illustration d'une diapositive que son parcours n'illustre pas.
 *
 * Neutre à dessein (« bienvenue », pas un sujet) : elle comble la hauteur que la modale plein
 * écran réserve à l'illustration, elle ne remplace pas l'icône propre à la diapositive, que le
 * parcours doit passer. Constante de module : un seul élément, pas une allocation par rendu.
 */
const ILLUSTRATION_PAR_DEFAUT = <WelcomeIllustration icon={Sparkles} />;

/**
 * TCK-251 — Reusable, role-agnostic welcome modale.
 *
 * Mobile: fullscreen sheet. Desktop: centered card over a dimmed backdrop
 * (the project's `<Dialog>` primitive already handles overlay + Esc /
 * outside-click via Base UI). Slide content is owned by the parent — this
 * component knows nothing about which role / parcours it's serving.
 *
 * The component intentionally has no network calls — the persistence
 * contract (`/api/me/welcome-seen`) is handled by `useWelcomeOnce`.
 */
export function WelcomeModal({ open, slides, onComplete, onSkip }: WelcomeModalProps) {
  const t = useTranslations('welcome');
  const [index, setIndex] = useState(0);
  // Reset slide index when the modale transitions from closed → open.
  // We use the React "store-and-compare-during-render" idiom rather than
  // an effect: the latter triggers cascading renders on every open change.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setIndex(0);
  }

  const total = slides.length;
  const isLast = index >= total - 1;
  const current = slides[index];

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setIndex((i) => Math.min(i + 1, total - 1));
    }
  }, [isLast, onComplete, total]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Base UI fires `onOpenChange(false)` on Esc, backdrop click, or
      // close-button activation — TCK-251 AC2 treats all three as a skip.
      if (!next) onSkip();
    },
    [onSkip],
  );

  // Defensive: if the parent passes `open` but no slides, render nothing
  // rather than a blank shell.
  if (!current) return null;

  const illustration = current.illustration ?? ILLUSTRATION_PAR_DEFAUT;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-label={t('dialogAriaLabel')}
        className={cn(
          // Mobile fullscreen ↔ desktop centered card. Override the
          // primitive's default max-width on small screens.
          'max-w-[100vw] sm:max-w-md',
          'h-[100dvh] sm:h-auto sm:max-h-[min(80vh,34rem)]',
          'rounded-none sm:rounded-xl',
          'flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        {/*
          TCK-567 (M10) — LA SCÈNE est la seule zone qui grandit, et elle porte le contenu.

          Plein écran sous `sm` (TCK-251), la modale a plus de hauteur que sa diapositive. Cette
          hauteur allait à un espaceur VIDE (`<div className="flex-1" />`) posé entre le texte et
          les pastilles : un grand bloc blanc sur les trois diapositives, relevé par le testeur le
          2026-09-23 à 390 px. Désormais la scène prend la hauteur libre et y CENTRE la
          diapositive (illustration + texte) ; pastilles et boutons restent en pied, sous le pouce.

          ⚠ Le centrage passe par `my-auto` sur la diapositive, PAS par `justify-center` sur la
          scène. Les deux centrent en portrait (mesuré : 121 px au plus sans rien de peint à
          390 × 844, à l'identique), mais la scène défile (`overflow-y-auto`) : en paysage, quand la
          diapositive est plus haute qu'elle, `justify-center` la fait déborder PAR LES DEUX
          BOUTS, et le débordement du haut n'est pas atteignable par défilement — 56 px
          d'illustration coupés à 568 × 320 (vérification adverse du 2026-09-23), et encore
          24 px à 360 × 640 quand le texte est agrandi à 150 % (réglage d'accessibilité). Une marge
          `auto` ne prend que l'espace POSITIF : en débordement, elle vaut 0, la diapositive part
          du haut et défile vers le bas. C'est le centrage « sûr » sans dépendre du mot-clé
          `safe` (`justify-center-safe`), arrivé tard dans Safari : là où il manque, la
          déclaration entière est ignorée et le vide retombe sous le texte — WebKit n'a pas pu
          être éprouvé ici, une marge `auto` n'a pas besoin de l'être. `WelcomeModal.test.tsx`
          le garde.

          `pt-6` : la croix de fermeture du primitif est en `top-2 right-2` — l'illustration ne
          passe pas dessous.
        */}
        <div
          data-testid="welcome-stage"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-6"
        >
          <div data-testid="welcome-slide" className="my-auto flex flex-col gap-6 sm:gap-5">
            {/*
              LA BOÎTE DE L'ILLUSTRATION porte À LA FOIS sa hauteur et sa peinture (`bg-muted`).
              Hauteur ici, peinture dans l'enfant (`h-full`), c'était une propagation dont la
              perte rendait le bloc blanc — 80 px peints dans 320 réservés — sans qu'aucun test ne
              rougisse. Téléphone : ce que l'écran laisse après le reste (`100dvh - 24rem` : croix,
              texte, pastilles, boutons), entre 9rem et 20rem ; à partir de `sm`, carte centrée,
              11rem. Pas `40dvh` : identique à 360 × 640 et plafonné pareil à 390 × 844, mais
              entre 480 et 560 px de haut il poussait la dernière ligne du texte sous la ligne de
              flottaison (mesuré à 360 × 500 et 360 × 520).

              Écran de moins de 30rem de haut (téléphone en paysage) : l'illustration, DÉCORATIVE,
              s'efface. La scène n'y a que 146 à 194 px : illustration en tête, le titre et le
              texte partaient sous la ligne de flottaison, sans rien qui dise de défiler — mesuré
              à 568 × 320, 667 × 375 et 844 × 390. Le sens est dans le texte ; il passe d'abord.
            */}
            <div
              data-testid="welcome-illustration"
              aria-hidden="true"
              className="relative flex h-[clamp(9rem,calc(100dvh-24rem),20rem)] w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted sm:h-44 [@media(max-height:30rem)]:hidden"
            >
              {illustration}
            </div>

            <DialogHeader className="text-center">
              <DialogTitle className="font-display text-xl font-semibold tracking-tight">
                {current.title}
              </DialogTitle>
              <DialogDescription className="mx-auto max-w-sm text-base leading-relaxed text-pretty sm:text-sm">
                {current.body}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div
          role="group"
          aria-label={t('stepAriaLabel', { current: index + 1, total })}
          className="flex shrink-0 items-center justify-center gap-1.5 py-2"
        >
          {slides.map((_, i) => (
            <span
              key={i}
              data-testid="welcome-dot"
              data-active={i === index || undefined}
              aria-current={i === index ? 'step' : undefined}
              className={cn(
                'h-1.5 rounded-full transition-[width,background-color]',
                i === index ? 'w-6 bg-foreground' : 'w-1.5 bg-foreground/25',
              )}
            />
          ))}
        </div>

        <div className="flex shrink-0 flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="link"
            onClick={onSkip}
            data-testid="welcome-skip"
            className="text-muted-foreground"
          >
            {t('skip')}
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            data-testid="welcome-next"
          >
            {isLast ? t('finish') : t('next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
