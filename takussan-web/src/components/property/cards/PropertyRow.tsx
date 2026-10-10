'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PropertyListItem } from '@/types/property';
import { PropertyCardStandard } from './PropertyCardStandard';
import { PropertyCardCover } from './PropertyCardCover';
import { PropertyCardListing } from './PropertyCardListing';
import { PropertyCardCompact } from './PropertyCardCompact';
import type { CardVariant } from './types';
import { EnTeteDeRangee } from './EnTeteDeRangee';

export type { CardVariant } from './types';

interface PropertyRowProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly viewAllHref?: string;
  readonly variant: CardVariant;
  readonly properties: readonly PropertyListItem[];
  readonly loading: boolean;
  readonly error: string | null;
  /** Libellé du lien "voir tout" — i18n. */
  readonly viewAllLabel?: string;
  /** Cache les flèches de scroll (utile pour les rangées custom — ex. Récemment vus). */
  readonly showArrows?: boolean;
  /** Bouton custom à droite du header (remplace `viewAllHref`). */
  readonly action?: { label: string; onClick: () => void; variant?: 'link' | 'destructive-link' };
  /**
   * Number of cards to flag with `priority` (eager preload). Default 0:
   * use `2` for the first above-the-fold row only, otherwise Next.js
   * will preload below-the-fold images and the browser console will
   * warn `was preloaded using link preload but not used` (TCK-166).
   */
  readonly priorityCount?: number;
}

interface VariantSpec {
  Card: React.ComponentType<{
    property: PropertyListItem;
    priority?: boolean;
    index?: number;
  }>;
  skeleton: 'image-1-1' | 'image-3-4' | 'horizontal';
  /** `deux-lignes` : la carte horizontale se range sur deux rangées qui défilent ensemble. */
  disposition: 'rangee' | 'deux-lignes';
}

/**
 * TCK-628 — LA LARGEUR D'UNE CARTE SE DÉDUIT DU NOMBRE DE COLONNES, PLUS L'INVERSE.
 *
 * Les cartes avaient une largeur fixe (290, 260, 210, 440 px) : la rangée en montrait ~4,25 à
 * 1920 px, là où Airbnb en montre 7 au même viewport (relevé du porteur, 2026-10-10). La rangée
 * fixe maintenant un nombre de colonnes PAR LARGEUR DE CONTENEUR — `@container`, et non le
 * viewport : la même rangée sert l'accueil (1872 px de contenu à 1920) et la fiche d'un bien
 * (« Récemment consultés », 1216 px au plus), qui n'ont pas la même place à offrir.
 *
 *     contenu   < 512   ≥ 512   ≥ 768   ≥ 960   ≥ 1088   ≥ 1216 px
 *     cartes     2,15    3,2      4       5        6        7
 *
 * Retour du porteur du 2026-10-10, capture d'Airbnb à l'appui : sept cartes dès un écran
 * d'ordinateur ordinaire, pas seulement à 1920. Les paliers d'origine (7 dès 1680 px de contenu)
 * n'en donnaient que 5 sur un portable de 1280 à 1440. Une carte mesure donc 160 px au plus étroit
 * de sept (1216 px de contenu) et 254 px à 1920.
 *
 * Les fractions sous 896 px sont voulues : la carte suivante DÉPASSE, et c'est ce qui dit au
 * doigt que la rangée défile. Au bureau, des colonnes entières et des flèches.
 *
 * La carte horizontale (« À louer ») est deux fois plus large : elle se range sur DEUX lignes, ce
 * qui rend à la rangée la densité des autres (2 × 5 à 1920 px).
 *
 * La largeur est imposée aux enfants par `!important` : chaque variante garde sa largeur native
 * (`w-[290px]`…), qui reste celle d'une carte posée hors rangée.
 */
// ⚠ Chaînes LITTÉRALES, jamais composées par `${…}` : Tailwind lit les classes dans le texte du
// source, et une classe assemblée à l'exécution n'y figure pas — elle ne serait jamais générée.
const DISPOSITIONS: Record<VariantSpec['disposition'], string> = {
  rangee:
    'flex [--colonnes:2.15] @lg:[--colonnes:3.2] @3xl:[--colonnes:4] @min-[60rem]:[--colonnes:5] @min-[68rem]:[--colonnes:6] @min-[76rem]:[--colonnes:7] [&>*]:w-[calc((100%_-_(var(--colonnes)_-_1)_*_var(--gap))_/_var(--colonnes))]! [&>*]:shrink-0',
  'deux-lignes':
    'grid grid-flow-col grid-rows-2 auto-cols-[calc((100%_-_(var(--colonnes)_-_1)_*_var(--gap))_/_var(--colonnes))] [--colonnes:1.1] @lg:[--colonnes:1.6] @min-[40rem]:[--colonnes:2.1] @4xl:[--colonnes:3] @7xl:[--colonnes:4] @min-[105rem]:[--colonnes:5] [&>*]:w-auto!',
};

const VARIANTS: Record<CardVariant, VariantSpec> = {
  standard: { Card: PropertyCardStandard, skeleton: 'image-1-1', disposition: 'rangee' },
  cover:    { Card: PropertyCardCover,    skeleton: 'image-3-4', disposition: 'rangee' },
  listing:  { Card: PropertyCardListing,  skeleton: 'horizontal', disposition: 'deux-lignes' },
  compact:  { Card: PropertyCardCompact,  skeleton: 'image-1-1', disposition: 'rangee' },
};

function VariantSkeleton({ kind }: { kind: VariantSpec['skeleton'] }) {
  if (kind === 'horizontal') {
    return (
      <div className="animate-pulse">
        <div className="flex gap-3 p-3 rounded-[20px] bg-card border border-border">
          <div className="aspect-square w-28 sm:w-32 rounded-lg bg-muted" />
          <div className="flex-1 py-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="h-3 w-2/5 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted mt-4" />
          </div>
        </div>
      </div>
    );
  }

  const aspect = kind === 'image-3-4' ? 'aspect-[3/4]' : 'aspect-square';

  return (
    <div className="animate-pulse">
      <div className={`${aspect} rounded-2xl bg-muted`} />
      <div className="mt-2.5 space-y-1.5">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-2/5 rounded bg-muted" />
      </div>
    </div>
  );
}

/**
 * Rangée scrollable horizontale, dispatchée vers la bonne variante de carte.
 * TCK-129 — composant générique pour la home publique.
 */
export function PropertyRow({
  eyebrow,
  title,
  viewAllHref,
  viewAllLabel,
  variant,
  properties,
  loading,
  error,
  showArrows = true,
  action,
  priorityCount = 0,
}: PropertyRowProps) {
  const t = useTranslations('property.row');
  const spec = VARIANTS[variant];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function updateArrows() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, [properties.length, loading]);

  function scrollBy(direction: 1 | -1) {
    // TCK-628 — un geste avance d'un ÉCRAN de cartes entières, comme Airbnb : la largeur d'une
    // carte dépend du conteneur, elle se lit sur la première carte rendue, l'écart sur la grille.
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const pas = first ? first.offsetWidth + gap : el.clientWidth;
    const parEcran = Math.max(1, Math.floor((el.clientWidth + gap) / pas));
    el.scrollBy({ left: pas * parEcran * direction, behavior: 'smooth' });
  }

  const Card = spec.Card;

  return (
    <section className="relative @container">
      <EnTeteDeRangee eyebrow={eyebrow} title={title}>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className={`inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold transition-colors ${
              action.variant === 'destructive-link'
                ? 'text-destructive hover:opacity-80'
                : 'text-foreground hover:text-primary'
            }`}
          >
            {action.label}
          </button>
        ) : (
          viewAllHref && (
            <LienLocalise
              href={viewAllHref}
              className="inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap text-[14px] font-semibold text-foreground underline-offset-4 hover:underline hover:text-primary transition-colors"
            >
              {viewAllLabel ?? t('viewAll')}
              <ChevronRight aria-hidden="true" className="size-4 text-primary" strokeWidth={2} />
            </LienLocalise>
          )
        )}

        {/* Flèches : 32 px, posées en bordure (Airbnb) — elles servent la souris, le doigt fait
            défiler la rangée elle-même. */}
        {showArrows && (
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={!canLeft}
              aria-label={t('previous')}
              className="size-8 rounded-full bg-card border border-border text-foreground flex items-center justify-center shadow-sm transition-[border-color,opacity,scale,box-shadow] hover:border-foreground/40 hover:shadow-md active:scale-[0.96] disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <ChevronLeft className="size-4" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={!canRight}
              aria-label={t('next')}
              className="size-8 rounded-full bg-card border border-border text-foreground flex items-center justify-center shadow-sm transition-[border-color,opacity,scale,box-shadow] hover:border-foreground/40 hover:shadow-md active:scale-[0.96] disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <ChevronRight className="size-4" strokeWidth={2.25} />
            </button>
          </div>
        )}
      </EnTeteDeRangee>

      {error ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {error}
        </div>
      ) : !loading && properties.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {t('empty')}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className={`${DISPOSITIONS[spec.disposition]} gap-3 [--gap:0.75rem] @lg:gap-4 @lg:[--gap:1rem] overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:snap-start`}
        >
          {loading
            ? Array.from({ length: spec.disposition === 'deux-lignes' ? 10 : 7 }).map((_, i) => (
                <VariantSkeleton key={i} kind={spec.skeleton} />
              ))
            : properties.map((property, i) => (
                <Card
                  key={property.id}
                  property={property}
                  priority={i < priorityCount}
                  index={i}
                />
              ))}
        </div>
      )}
    </section>
  );
}
