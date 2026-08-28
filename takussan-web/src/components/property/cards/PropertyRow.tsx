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
  width: number;
  step: number;
  Card: React.ComponentType<{
    property: PropertyListItem;
    priority?: boolean;
    index?: number;
  }>;
  skeleton: 'image-4-3' | 'image-3-4' | 'image-1-1' | 'horizontal';
}

const VARIANTS: Record<CardVariant, VariantSpec> = {
  standard: { width: 290, step: 314, Card: PropertyCardStandard, skeleton: 'image-4-3' },
  cover:    { width: 260, step: 284, Card: PropertyCardCover,    skeleton: 'image-3-4' },
  listing:  { width: 440, step: 464, Card: PropertyCardListing,  skeleton: 'horizontal' },
  compact:  { width: 210, step: 234, Card: PropertyCardCompact,  skeleton: 'image-1-1' },
};

function VariantSkeleton({ kind, width }: { kind: VariantSpec['skeleton']; width: number }) {
  if (kind === 'horizontal') {
    return (
      <div className="w-[440px] shrink-0 animate-pulse">
        <div className="flex gap-4 p-3 rounded-2xl bg-card border border-border">
          <div className="aspect-square w-[170px] rounded-xl bg-muted" />
          <div className="flex-1 py-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="h-3 w-2/5 rounded bg-muted" />
            <div className="h-5 w-1/3 rounded bg-muted mt-4" />
          </div>
        </div>
      </div>
    );
  }

  const aspect =
    kind === 'image-4-3' ? 'aspect-[4/3]' :
    kind === 'image-3-4' ? 'aspect-[3/4]' :
    'aspect-square';

  return (
    <div className="shrink-0 animate-pulse" style={{ width }}>
      <div className={`${aspect} rounded-xl bg-muted`} />
      <div className="mt-4 space-y-2">
        <div className="h-4 w-2/5 rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
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
    scrollerRef.current?.scrollBy({
      left: spec.step * direction * 2,
      behavior: 'smooth',
    });
  }

  const Card = spec.Card;

  return (
    <section className="relative">
      <div className="mb-6 flex items-end justify-between gap-4 px-1">
        <div className="space-y-1.5">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-[26px] md:text-[30px] leading-[1.1] font-semibold text-foreground">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-3 shrink-0 pb-1">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className={`hidden md:inline-flex items-center gap-1 text-[14px] font-semibold transition-colors ${
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
                className="hidden md:inline-flex items-center gap-1 text-[14px] font-semibold text-foreground hover:text-primary transition-colors"
              >
                {viewAllLabel ?? t('viewAll')}
                <span aria-hidden="true" className="text-primary">▸</span>
              </LienLocalise>
            )
          )}

          {showArrows && (
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                disabled={!canLeft}
                aria-label={t('previous')}
                className="size-11 rounded-full bg-card border border-border text-primary flex items-center justify-center transition-all hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="size-5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                disabled={!canRight}
                aria-label={t('next')}
                className="size-11 rounded-full bg-card border border-border text-primary flex items-center justify-center transition-all hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="size-5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

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
          className="flex gap-6 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:snap-start"
        >
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <VariantSkeleton key={i} kind={spec.skeleton} width={spec.width} />
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
