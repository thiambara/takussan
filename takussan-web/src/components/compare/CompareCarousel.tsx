'use client';

import React, { useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import Image from 'next/image';
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
 * Each row is a horizontally-scrollable strip that pins the row label
 * on the left and reveals one cell per property as the user swipes.
 * Uses native CSS scroll-snap — no extra deps.
 */

const FALLBACK_IMAGE =
  'https://placehold.co/400x300/e7e5e4/a8a29e?text=Photo+%C3%A0+venir';

function formatCell(
  row: CompareRowDef,
  value: CompareCell,
  t: ReturnType<typeof useTranslations>,
): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-stone-400">—</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-stone-400">—</span>;
    return (
      <ul className="flex flex-wrap gap-1">
        {value.map((item) => (
          <li
            key={item}
            className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700"
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
            className="flex min-w-[85%] snap-start flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3"
          >
            {col.property ? (
              <>
                <LienLocalise
                  href={`/properties/${col.property.slug}`}
                  className="relative block aspect-4/3 overflow-hidden rounded-lg"
                >
                  <Image
                    src={col.property.main_photo_url ?? FALLBACK_IMAGE}
                    alt={col.property.title}
                    fill
                    sizes="85vw"
                    className="object-cover"
                    unoptimized={(col.property.main_photo_url ?? FALLBACK_IMAGE).startsWith(
                      'https://placehold.co',
                    )}
                  />
                </LienLocalise>
                <h3 className="line-clamp-2 text-sm font-semibold text-stone-900">
                  {col.property.title}
                </h3>
                <div className="flex items-center justify-between">
                  <LienLocalise
                    href={`/properties/${col.property.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('actions.view')}
                  </LienLocalise>
                  <button
                    type="button"
                    onClick={() => onRemove(col.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-red-600"
                    aria-label={`${t('actions.remove')} ${col.property.title}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('actions.remove')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="flex aspect-4/3 w-full items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-500">
                  {t('table.unavailable')}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(col.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('actions.remove')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div role="table" aria-label={t('carousel.ariaLabel')} className="space-y-2">
        {rows.map((row) => {
          const def = COMPARE_ROW_DEFS.find((d) => d.id === row.id)!;
          return (
            <section
              key={row.id}
              role="row"
              data-divergent={row.divergent ? 'true' : 'false'}
              className={cn(
                'rounded-xl border border-stone-200 p-3',
                row.divergent ? 'bg-amber-50/60' : 'bg-white',
              )}
            >
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {tRows(def.labelKey)}
                {row.divergent && (
                  <span className="inline-flex items-center rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                    !=
                  </span>
                )}
              </h3>
              <div
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
                role="list"
              >
                {columns.map((col, colIndex) => (
                  <div
                    key={col.id}
                    role="listitem"
                    className="min-w-[85%] snap-start text-sm text-stone-700"
                  >
                    {col.property ? (
                      formatCell(def, row.values[colIndex], t)
                    ) : (
                      <span className="italic text-stone-400">—</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
