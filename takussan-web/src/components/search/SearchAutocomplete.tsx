'use client';

import React, { useState, useRef, useId, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useSuggest } from '@/hooks/useSuggest';
import { highlightMatch } from '@/lib/highlightMatch';
import type { SuggestCity, SuggestNeighborhood, SuggestPropertyType } from '@/types/search';
import { cn } from '@/lib/utils';

type SuggestItem =
  | { kind: 'city'; data: SuggestCity }
  | { kind: 'neighborhood'; data: SuggestNeighborhood }
  | { kind: 'property_type'; data: SuggestPropertyType };

function buildUrl(item: SuggestItem): string {
  const params = new URLSearchParams();
  if (item.kind === 'city') {
    params.set('city', item.data.label);
  } else if (item.kind === 'neighborhood') {
    params.set('city', item.data.city);
    params.set('neighborhood', item.data.label);
  } else {
    params.set('type', item.data.value);
  }
  return `/properties?${params.toString()}`;
}

function HighlightedText({ label, query }: { label: string; query: string }) {
  const { before, match, after } = highlightMatch(label, query);
  if (!match) return <span>{label}</span>;
  return (
    <span>
      {before}
      <mark className="bg-primary/15 text-primary font-semibold not-italic rounded-sm px-px">{match}</mark>
      {after}
    </span>
  );
}

export interface SearchAutocompleteProps {
  placeholder?: string;
  variant?: 'hero' | 'navbar';
  className?: string;
  onQueryChange?: (query: string) => void;
}

export function SearchAutocomplete({
  placeholder,
  variant = 'hero',
  className,
  onQueryChange,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const t = useTranslations('search.suggest');
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetching } = useSuggest(query);

  const responseData = data?.data;

  const cities = useMemo(() => responseData?.cities ?? [], [responseData]);
  const neighborhoods = useMemo(() => responseData?.neighborhoods ?? [], [responseData]);
  const propertyTypes = useMemo(() => responseData?.property_types ?? [], [responseData]);

  const flatItems = useMemo<SuggestItem[]>(
    () => [
      ...cities.map((d): SuggestItem => ({ kind: 'city', data: d })),
      ...neighborhoods.map((d): SuggestItem => ({ kind: 'neighborhood', data: d })),
      ...propertyTypes.map((d): SuggestItem => ({ kind: 'property_type', data: d })),
    ],
    [cities, neighborhoods, propertyTypes],
  );

  const hasResults = flatItems.length > 0;
  const showEmpty = query.length >= 1 && !isLoading && !isFetching && !hasResults && open;
  const showLoading = (isLoading || isFetching) && query.length >= 1 && open;

  const selectItem = useCallback(
    (item: SuggestItem) => {
      setOpen(false);
      setQuery('');
      router.push(buildUrl(item));
    },
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open) {
        if (e.key === 'ArrowDown' && query) setOpen(true);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && flatItems[activeIndex]) {
          selectItem(flatItems[activeIndex]);
        } else {
          setOpen(false);
          router.push(`/properties?city=${encodeURIComponent(query)}`);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [open, query, flatItems, activeIndex, selectItem, router],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const defaultPlaceholder = t('placeholder');

  const isNavbar = variant === 'navbar';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className={cn(
          'flex items-center gap-2',
          isNavbar
            ? 'h-9 min-w-72 rounded-full bg-white/10 px-4 text-white/80 hover:bg-white/20'
            : 'rounded-full border border-stone-200 bg-white px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow',
        )}
      >
        <Search className={cn('shrink-0', isNavbar ? 'size-4 text-white/60' : 'size-4 text-primary')} />
        <input
          ref={inputRef}
          id={inputId}
          role="searchbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-item-${activeIndex}` : undefined}
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onQueryChange?.(v);
            setOpen(v.length >= 1);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.length >= 1) setOpen(true); }}
          placeholder={placeholder ?? defaultPlaceholder}
          className={cn(
            'w-full bg-transparent text-sm outline-none',
            isNavbar ? 'text-white placeholder:text-white/50' : 'text-gray-900 placeholder:text-gray-400 font-medium',
          )}
          autoComplete="off"
        />
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t('placeholder')}
          className="absolute left-0 top-full z-50 mt-2 w-full min-w-[320px] rounded-xl bg-white shadow-lg ring-1 ring-stone-200 overflow-hidden"
        >
          {showLoading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-stone-100" />
              ))}
            </div>
          )}

          {showEmpty && (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-stone-500">
                {t('empty', { query })}
              </p>
              <div className="mt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/properties')}
                  className="text-xs text-primary font-semibold hover:underline underline-offset-2"
                >
                  {t('fallback.all_cities')}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/properties?type=apartment')}
                  className="text-xs text-primary font-semibold hover:underline underline-offset-2"
                >
                  {t('fallback.all_types')}
                </button>
              </div>
            </div>
          )}

          {!showLoading && hasResults && (
            <ul className="py-2 max-h-80 overflow-y-auto">
              {cities.length > 0 && (
                <>
                  <li className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    {t('groups.cities')}
                  </li>
                  {cities.map((city, i) => {
                    const idx = i;
                    return (
                      <li
                        key={`city-${city.label}`}
                        id={`${listboxId}-item-${idx}`}
                        role="option"
                        aria-selected={activeIndex === idx}
                        className={cn(
                          'flex cursor-pointer items-center justify-between px-4 py-2 text-sm transition-colors',
                          activeIndex === idx ? 'bg-primary/8 text-primary' : 'text-stone-800 hover:bg-stone-50',
                        )}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => { e.preventDefault(); selectItem({ kind: 'city', data: city }); }}
                      >
                        <HighlightedText label={city.label} query={query} />
                        <span className="ml-2 shrink-0 text-xs text-stone-400">{city.count}</span>
                      </li>
                    );
                  })}
                </>
              )}

              {neighborhoods.length > 0 && (
                <>
                  <li className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    {t('groups.neighborhoods')}
                  </li>
                  {neighborhoods.map((nb, i) => {
                    const idx = cities.length + i;
                    return (
                      <li
                        key={`nb-${nb.label}-${nb.city}`}
                        id={`${listboxId}-item-${idx}`}
                        role="option"
                        aria-selected={activeIndex === idx}
                        className={cn(
                          'flex cursor-pointer items-center justify-between px-4 py-2 text-sm transition-colors',
                          activeIndex === idx ? 'bg-primary/8 text-primary' : 'text-stone-800 hover:bg-stone-50',
                        )}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => { e.preventDefault(); selectItem({ kind: 'neighborhood', data: nb }); }}
                      >
                        <span className="flex flex-col gap-0.5">
                          <HighlightedText label={nb.label} query={query} />
                          <span className="text-xs text-stone-400">{nb.city}</span>
                        </span>
                        <span className="ml-2 shrink-0 text-xs text-stone-400">{nb.count}</span>
                      </li>
                    );
                  })}
                </>
              )}

              {propertyTypes.length > 0 && (
                <>
                  <li className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    {t('groups.property_types')}
                  </li>
                  {propertyTypes.map((pt, i) => {
                    const idx = cities.length + neighborhoods.length + i;
                    return (
                      <li
                        key={`pt-${pt.value}`}
                        id={`${listboxId}-item-${idx}`}
                        role="option"
                        aria-selected={activeIndex === idx}
                        className={cn(
                          'flex cursor-pointer items-center justify-between px-4 py-2 text-sm transition-colors',
                          activeIndex === idx ? 'bg-primary/8 text-primary' : 'text-stone-800 hover:bg-stone-50',
                        )}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => { e.preventDefault(); selectItem({ kind: 'property_type', data: pt }); }}
                      >
                        <HighlightedText label={pt.label} query={query} />
                        <span className="ml-2 shrink-0 text-xs text-stone-400">{pt.count}</span>
                      </li>
                    );
                  })}
                </>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
