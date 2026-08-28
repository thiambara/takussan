'use client';

import React, { useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import Image from 'next/image';
import { ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { PropertyDetail } from '@/types/property';
import { cn } from '@/lib/utils';
import {
  buildCompareRows,
  COMPARE_ROW_DEFS,
  type CompareCell,
  type CompareRowDef,
} from '@/components/compare/compare-rows';

/**
 * TCK-082 — desktop side-by-side comparator table.
 *
 * A column == a property. Rows are fixed (see {@link COMPARE_ROW_DEFS}).
 * Diverging rows get a subtle amber tint + badge. The whole thing is
 * rendered with real `<table>` semantics — accessible with screen readers
 * and keyboard users alike.
 */

const FALLBACK_IMAGE =
  'https://placehold.co/400x300/e7e5e4/a8a29e?text=Photo+%C3%A0+venir';

export type CompareColumn = {
  readonly id: number;
  readonly property: PropertyDetail | null;
};

export interface CompareTableProps {
  readonly columns: readonly CompareColumn[];
  readonly onRemove: (id: number) => void;
  readonly className?: string;
}

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

export function CompareTable({ columns, onRemove, className }: CompareTableProps) {
  const t = useTranslations('compare');
  const tRows = useTranslations('compare.rows');

  const rows = useMemo(
    () => buildCompareRows(columns.map((col) => col.property)),
    [columns],
  );

  return (
    <div className={cn('w-full overflow-x-auto rounded-xl border border-stone-200 bg-white', className)}>
      <table
        className="w-full min-w-[640px] table-fixed border-collapse"
        aria-label={t('table.ariaLabel')}
      >
        <colgroup>
          <col className="w-40 md:w-48" />
          {columns.map((col) => (
            <col key={col.id} className="min-w-[200px]" />
          ))}
        </colgroup>

        <thead>
          <tr className="bg-stone-50">
            <th scope="col" className="sticky left-0 z-10 bg-stone-50 px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">
              {t('table.header')}
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className="px-3 py-3 text-left align-top"
              >
                <CompareColumnHeader
                  column={col}
                  onRemove={onRemove}
                  fallbackLabel={t('table.unavailable')}
                  viewLabel={t('actions.view')}
                  removeLabel={t('actions.remove')}
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const def = COMPARE_ROW_DEFS.find((d) => d.id === row.id)!;
            return (
              <tr
                key={row.id}
                className={cn(
                  'border-t border-stone-100 transition-colors',
                  row.divergent && 'bg-amber-50/60',
                )}
                data-divergent={row.divergent ? 'true' : 'false'}
              >
                <th
                  scope="row"
                  className={cn(
                    'sticky left-0 z-10 px-4 py-3 text-left align-top text-sm font-semibold text-stone-700',
                    row.divergent ? 'bg-amber-50/60' : 'bg-white',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {tRows(def.labelKey)}
                    {row.divergent && (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                        title={t('table.divergentTooltip')}
                      >
                        !=
                      </span>
                    )}
                  </span>
                </th>
                {columns.map((col, colIndex) => (
                  <td
                    key={col.id}
                    className="px-3 py-3 align-top text-sm text-stone-700"
                  >
                    {col.property ? (
                      formatCell(def, row.values[colIndex], t)
                    ) : (
                      <span className="text-stone-400 italic">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompareColumnHeader({
  column,
  onRemove,
  fallbackLabel,
  viewLabel,
  removeLabel,
}: {
  column: CompareColumn;
  onRemove: (id: number) => void;
  fallbackLabel: string;
  viewLabel: string;
  removeLabel: string;
}) {
  const { id, property } = column;

  if (!property) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex aspect-4/3 items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-500">
          {fallbackLabel}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-500">#{id}</span>
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
            aria-label={`${removeLabel} #${id}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {removeLabel}
          </button>
        </div>
      </div>
    );
  }

  const image = property.main_photo_url ?? FALLBACK_IMAGE;

  return (
    <div className="flex flex-col gap-2">
      <LienLocalise
        href={`/properties/${property.slug}`}
        className="relative block aspect-4/3 overflow-hidden rounded-lg ring-1 ring-stone-200 hover:ring-primary transition"
      >
        <Image
          src={image}
          alt={property.title}
          fill
          sizes="(max-width: 768px) 100vw, 300px"
          className="object-cover"
          unoptimized={image.startsWith('https://placehold.co')}
        />
      </LienLocalise>
      <div className="flex flex-col gap-0.5">
        <LienLocalise
          href={`/properties/${property.slug}`}
          className="line-clamp-2 text-sm font-semibold text-stone-900 hover:text-primary transition-colors"
          title={property.title}
        >
          {property.title}
        </LienLocalise>
      </div>
      <div className="flex items-center justify-between gap-2">
        <LienLocalise
          href={`/properties/${property.slug}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {viewLabel}
        </LienLocalise>
        <button
          type="button"
          onClick={() => onRemove(property.id)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-red-600 transition-colors"
          aria-label={`${removeLabel} ${property.title}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {removeLabel}
        </button>
      </div>
    </div>
  );
}
