'use client';

import React from 'react';
import Link from 'next/link';
import { Scale, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCompare } from '@/context/CompareContext';
import { COMPARE_MAX_IDS, idsToCsv } from '@/lib/compare';
import { cn } from '@/lib/utils';

/**
 * TCK-082 — sticky bottom-right pill showing the current comparator
 * selection. Hidden when empty or not hydrated (no SSR flash).
 */
export function CompareFloatingBar({ className }: { className?: string }) {
  const { ids, isHydrated, remove, clear } = useCompare();
  const t = useTranslations('compare.floatingBar');

  if (!isHydrated || ids.length === 0) return null;

  const cta = t('cta', { count: ids.length });
  const canCompare = ids.length >= 2;

  return (
    <aside
      aria-label={t('ariaLabel')}
      className={cn(
        'fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-2xl',
        'border border-stone-200 bg-white/95 p-2 pl-3 shadow-lg backdrop-blur',
        'sm:bottom-6 sm:right-6',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Scale className="h-4 w-4" />
        </div>
        <div className="text-xs leading-tight">
          <p className="font-semibold text-stone-900">{t('title')}</p>
          <p className="text-stone-500">{t('count', { count: ids.length, max: COMPARE_MAX_IDS })}</p>
        </div>
      </div>

      <ul className="flex items-center gap-1" role="list">
        {ids.map((id) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => remove(id)}
              className={cn(
                'group relative flex h-8 w-8 items-center justify-center rounded-full',
                'bg-stone-100 text-xs font-semibold text-stone-700',
                'hover:bg-red-50 hover:text-red-600 focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                'transition-colors',
              )}
              aria-label={t('removeAria', { id })}
            >
              <span className="group-hover:hidden">#{id}</span>
              <X className="hidden h-3.5 w-3.5 group-hover:block" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <Link
        href={canCompare ? `/compare?ids=${idsToCsv(ids)}` : '/compare'}
        aria-disabled={!canCompare}
        tabIndex={canCompare ? 0 : -1}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
          canCompare
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-stone-200 text-stone-500 cursor-not-allowed',
        )}
      >
        {cta}
      </Link>

      <button
        type="button"
        onClick={clear}
        aria-label={t('clearAria')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full',
          'text-stone-400 hover:text-stone-600 hover:bg-stone-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          'transition-colors',
        )}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
