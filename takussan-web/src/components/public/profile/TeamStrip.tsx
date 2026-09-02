'use client';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface TeamAgent {
  readonly id: number;
  readonly slug: string | null;
  readonly full_name: string;
  readonly avatar_url: string | null;
  readonly specialty?: string | null;
  readonly portfolio_count?: number;
}

interface TeamStripProps {
  readonly agents: ReadonlyArray<TeamAgent>;
  /** Surtitre de la section (i18n), au-dessus du titre. */
  readonly eyebrow?: string;
  /** Titre de la section (i18n) — rendu en `<h2>` dans l'en-tête, à gauche des flèches. */
  readonly heading?: string;
  /** `id` du `<h2>`, pour l'`aria-labelledby` de la section appelante. */
  readonly headingId?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function TeamStrip({ agents, eyebrow, heading, headingId }: TeamStripProps) {
  const t = useTranslations('publicProfile.team');
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  const scrollBy = useCallback((direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(280, el.clientWidth * 0.7);
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }, []);

  /**
   * TCK-505, défaut #10 — les flèches vivaient en `absolute left-full` / `right-full`, c'est-à-dire
   * HORS du conteneur `max-w-[1200px]` de la page : dès que le viewport n'a pas 52 px de marge de
   * chaque côté (< 1304 px), la flèche « suivants » sortait du viewport et le document débordait
   * de 4 px à 768 et 1024 (mesuré le 2026-09-02). Elles vivent maintenant dans l'en-tête de la
   * section, à droite du titre, dans le flux — le motif des rangées de l'accueil (`PropertyRow`).
   */
  const classeFleche =
    'hidden md:inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-all duration-150 ease-in-out hover:bg-muted hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30';

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2
              id={headingId}
              className="mt-2 font-display text-2xl md:text-3xl font-semibold text-foreground"
            >
              {heading}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-2 pb-1">
          <button
            type="button"
            aria-label={t('prevAria')}
            onClick={() => scrollBy(-1)}
            disabled={!canScrollLeft}
            className={classeFleche}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('nextAria')}
            onClick={() => scrollBy(1)}
            disabled={!canScrollRight}
            className={classeFleche}
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative mt-6">
        <ul
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {agents.map((a) => {
            const Inner = (
              <article className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-150 ease-in-out hover:shadow-md hover:border-primary/30">
                <Avatar size="lg">
                  {a.avatar_url && <AvatarImage src={a.avatar_url} alt={a.full_name} />}
                  <AvatarFallback>{getInitials(a.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{a.full_name}</p>
                  {a.specialty && (
                    <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {a.specialty}
                    </p>
                  )}
                  {typeof a.portfolio_count === 'number' && a.portfolio_count > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {t('propertiesCount', { count: a.portfolio_count })}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </article>
            );
            return (
              <li
                key={a.id}
                className="min-w-[280px] max-w-[320px] shrink-0 snap-start"
              >
                {a.slug ? (
                  <LienLocalise href={`/agents/${a.slug}`} className="block h-full">
                    {Inner}
                  </LienLocalise>
                ) : (
                  Inner
                )}
              </li>
            );
          })}
        </ul>

        {/* Fade latéraux */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent transition-opacity duration-150 ${
            canScrollLeft ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-150 ${
            canScrollRight ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    </div>
  );
}
