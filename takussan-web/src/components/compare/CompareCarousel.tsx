'use client';

import React, { useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import {
  buildCompareRows,
  COMPARE_ROW_DEFS,
  type CompareCell,
  type CompareRowDef,
} from '@/components/compare/compare-rows';
import type { CompareColumn } from '@/components/compare/CompareTable';

/**
 * TCK-082 — mobile "swipeable" comparator.
 *
 * The property cards form a swipeable strip (native CSS scroll-snap); each
 * criterion below lists every property's value, named by its title.
 */

function formatCell(
  row: CompareRowDef,
  value: CompareCell,
  t: ReturnType<typeof useTranslations>,
): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <ul className="flex flex-wrap justify-end gap-1">
        {value.map((item) => (
          <li
            key={item}
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'boolean') {
    return value ? t('values.yes') : t('values.no');
  }

  // Price arrives pre-formatted from `buildCell` (currency-aware);
  // only `area` still needs a client-side unit suffix.
  if (row.id === 'area' && typeof value === 'number') {
    return `${value} m²`;
  }

  return String(value);
}

export interface CompareCarouselProps {
  readonly columns: readonly CompareColumn[];
  readonly onRemove: (id: number) => void;
  readonly className?: string;
}

export function CompareCarousel({ columns, onRemove, className }: CompareCarouselProps) {
  const t = useTranslations('compare');
  const tRows = useTranslations('compare.rows');

  const rows = useMemo(
    () => buildCompareRows(columns.map((col) => col.property)),
    [columns],
  );

  return (
    <div
      className={cn('space-y-4', className)}
      role="group"
      aria-label={t('carousel.ariaLabel')}
    >
      {/* Header strip — property cards */}
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        role="list"
      >
        {columns.map((col) => (
          <div
            key={col.id}
            role="listitem"
            className="flex min-w-[85%] snap-start flex-col gap-2 rounded-xl border border-border bg-card p-3"
          >
            {col.property ? (
              <>
                <LienLocalise
                  href={`/properties/${col.property.slug}`}
                  className="relative block aspect-4/3 overflow-hidden rounded-lg"
                >
                  <PropertyPhoto src={col.property.main_photo_url} alt={col.property.title} sizes="85vw" />
                </LienLocalise>
                <h3 className="line-clamp-2 text-sm font-semibold text-foreground text-pretty">
                  {col.property.title}
                </h3>
                <div className="-my-1.5 flex items-center justify-between">
                  <LienLocalise
                    href={`/properties/${col.property.slug}`}
                    className="-ml-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('actions.view')}
                  </LienLocalise>
                  <button
                    type="button"
                    onClick={() => onRemove(col.id)}
                    className="-mr-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`${t('actions.remove')} ${col.property.title}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('actions.remove')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="flex aspect-4/3 w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                  {t('table.unavailable')}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(col.id)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-destructive"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('actions.remove')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rows — une liste par critère, chaque valeur NOMMÉE par son bien.
          Chaque ligne défilait jusqu'ici dans sa propre bande à 85 % de largeur, sans suivre la
          bande des photos : à 360 comme à 390, la 2ᵉ valeur restait coupée au bord (« 2 090 »,
          « À loue ») et rien ne disait à quel bien elle appartenait (revue design du 2026-09-16).
          Deux à quatre biens tiennent en hauteur ; le titre, tronqué, fait le lien. */}
      <div className="space-y-2">
        {rows.map((row) => {
          const def = COMPARE_ROW_DEFS.find((d) => d.id === row.id)!;
          return (
            <section
              key={row.id}
              data-divergent={row.divergent ? 'true' : 'false'}
              className={cn(
                'rounded-xl border border-border p-3',
                row.divergent ? 'bg-warning/10' : 'bg-card',
              )}
            >
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tRows(def.labelKey)}
                {row.divergent && (
                  <span
                    className="inline-flex items-center rounded-full border border-warning/30 bg-card px-1.5 py-0.5 text-xs font-semibold normal-case tracking-normal text-warning"
                    title={t('table.divergentTooltip')}
                  >
                    {t('table.divergentShort')}
                  </span>
                )}
              </h3>
              <dl className="space-y-1.5">
                {columns.map((col, colIndex) => (
                  <div key={col.id} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 truncate text-xs text-muted-foreground">
                      {col.property?.title ?? `#${col.id}`}
                    </dt>
                    <dd className="flex max-w-[60%] shrink-0 justify-end text-right text-sm text-foreground tabular-nums">
                      {col.property ? (
                        formatCell(def, row.values[colIndex], t)
                      ) : (
                        <span className="italic text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
