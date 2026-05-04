'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PropertyListItem } from '@/types/property';
import { PropertyCardLocal } from './PropertyCardLocal';
import { PropertyCardOverlay } from './PropertyCardOverlay';
import { PropertyCardWide } from './PropertyCardWide';
import { PropertyCardCompact } from './PropertyCardCompact';

export type CardVariant = 'standard' | 'overlay' | 'wide' | 'compact';

interface PropertyRowLocalProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly viewAllHref?: string;
  readonly variant: CardVariant;
  readonly properties: readonly PropertyListItem[];
  readonly loading: boolean;
  readonly error: string | null;
}

interface VariantSpec {
  width: number;
  aspect: 'pg-aspect-4-3' | 'pg-aspect-3-4' | 'pg-aspect-1-1' | 'wide';
  step: number;
  Card: React.ComponentType<{ property: PropertyListItem; priority?: boolean; index?: number }>;
  label: string;
}

const VARIANTS: Record<CardVariant, VariantSpec> = {
  standard: { width: 290, aspect: 'pg-aspect-4-3', step: 314, Card: PropertyCardLocal,    label: 'Standard 4:3' },
  overlay:  { width: 260, aspect: 'pg-aspect-3-4', step: 284, Card: PropertyCardOverlay,  label: 'Overlay 3:4' },
  wide:     { width: 440, aspect: 'wide',          step: 464, Card: PropertyCardWide,     label: 'Wide horizontal' },
  compact:  { width: 210, aspect: 'pg-aspect-1-1', step: 234, Card: PropertyCardCompact,  label: 'Compact 1:1' },
};

function VariantSkeleton({ variant }: { variant: CardVariant }) {
  const spec = VARIANTS[variant];

  if (variant === 'wide') {
    return (
      <div className="w-[440px] shrink-0 animate-pulse">
        <div className="flex gap-4 p-3 rounded-2xl bg-[var(--pg-cream)] border border-[var(--pg-hairline)]">
          <div className="pg-card-image pg-aspect-1-1 w-[170px] bg-[var(--pg-cream-soft)]" />
          <div className="flex-1 py-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-[var(--pg-cream-soft)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--pg-cream-soft)]" />
            <div className="h-3 w-2/5 rounded bg-[var(--pg-cream-soft)]" />
            <div className="h-5 w-1/3 rounded bg-[var(--pg-cream-soft)] mt-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 animate-pulse" style={{ width: spec.width }}>
      <div className={`pg-card-image ${spec.aspect} bg-[var(--pg-cream-soft)]`} />
      <div className="mt-4 space-y-2">
        <div className="h-4 w-2/5 rounded bg-[var(--pg-cream-soft)]" />
        <div className="h-3 w-3/4 rounded bg-[var(--pg-cream-soft)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--pg-cream-soft)]" />
      </div>
    </div>
  );
}

export function PropertyRowLocal({
  eyebrow,
  title,
  viewAllHref,
  variant,
  properties,
  loading,
  error,
}: PropertyRowLocalProps) {
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
    scrollerRef.current?.scrollBy({ left: spec.step * direction * 2, behavior: 'smooth' });
  }

  const Card = spec.Card;

  return (
    <section className="relative">
      <div className="mb-6 flex items-end justify-between gap-4 px-1">
        <div className="space-y-1.5">
          <p className="pg-eyebrow text-[var(--pg-accent)]">{eyebrow}</p>
          <h2 className="pg-display text-[26px] md:text-[30px] leading-[1.1] font-semibold text-[var(--pg-ink)]">
            {title}
          </h2>
          <p className="text-[11px] font-medium text-[var(--pg-ink-muted)]/70 pt-1">
            Variante : <span className="font-semibold">{spec.label}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 pb-1">
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="hidden md:inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--pg-ink)] hover:text-[var(--pg-accent)] transition-colors"
            >
              Tout voir
              <span aria-hidden="true" className="text-[var(--pg-accent)]">▸</span>
            </Link>
          )}

          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={!canLeft}
              aria-label="Précédent"
              className="size-11 rounded-full bg-[var(--pg-cream)] border border-[var(--pg-hairline)] text-[var(--pg-accent)] flex items-center justify-center transition-all hover:border-[var(--pg-accent)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={!canRight}
              aria-label="Suivant"
              className="size-11 rounded-full bg-[var(--pg-cream)] border border-[var(--pg-hairline)] text-[var(--pg-accent)] flex items-center justify-center transition-all hover:border-[var(--pg-accent)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="size-5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="py-12 text-center text-[var(--pg-ink-muted)] text-sm">{error}</div>
      ) : !loading && properties.length === 0 ? (
        <div className="py-12 text-center text-[var(--pg-ink-muted)] text-sm">
          Pas encore de biens dans cette sélection.
        </div>
      ) : (
        <div ref={scrollerRef} className="pg-row-scroll flex gap-6 overflow-x-auto pb-2">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <VariantSkeleton key={i} variant={variant} />)
            : properties.map((property, i) => (
                <Card key={property.id} property={property} priority={i < 2} index={i} />
              ))}
        </div>
      )}
    </section>
  );
}
