'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, Tag, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  customerStatusValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';
import type { Tag as TagType } from '@/types/tag';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';

/**
 * CRM filters bar. Same rules as the property filters: every filter is
 * round-tripped through the URL and pushed to the backend via spatie
 * `filter[...]`.
 */

const ALL_VALUE = '__all__';

interface Props {
  crmTags?: Pick<TagType, 'id' | 'name' | 'color'>[];
}

export function CustomerListFilters({ crmTags = [] }: Props) {
  const t = useTranslations('crm.filters');
  const tStage = useTranslations('crm.pipeline.stage');
  const tStatus = useTranslations('crm.customerStatus');
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') ?? '';
  const currentStatus = searchParams.get('status') ?? '';
  const currentPipeline = searchParams.get('pipeline_stage') ?? '';
  const currentTagsParam = searchParams.get('tags') ?? '';

  const activeTags = currentTagsParam ? currentTagsParam.split(',').filter(Boolean) : [];

  // TCK-316 — resynchronisé sur l'URL SANS `useEffect` : l'effet rendait, puis
  // peignait l'ancienne valeur, puis re-rendait. Cf. `useStateSyncedWith`.
  const [searchInput, setSearchInput] = useStateSyncedWith(currentSearch);

  // Fonctions nues : le React Compiler mémoïse (ADR-0015). Les `useCallback` manuels portaient
  // un `activeTags` recalculé à chaque rendu, ce qui les invalidait de toute façon.
  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL_VALUE) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.replace(`?${params.toString()}`);
  };

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateParam('search', searchInput.trim() || null);
  };

  const toggleTag = (name: string) => {
    const next = activeTags.includes(name)
      ? activeTags.filter((t) => t !== name)
      : [...activeTags, name];
    updateParam('tags', next.length > 0 ? next.join(',') : null);
  };

  const clearTags = () => {
    updateParam('tags', null);
  };

  return (
    // `lg` et non `md` : sous la barre latérale, 768 ne laisse que 464 px — la recherche y
    // tombait à « Nom, p » (revue design 2026-09-16, TCK-505).
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 lg:flex-row lg:items-center">
      <form onSubmit={onSearchSubmit} className="min-w-0 flex-1">
        <label htmlFor="customer-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="customer-search"
            placeholder={t('searchPlaceholder')}
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </form>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {crmTags.length > 0 && (
          <TagFilter
            tags={crmTags}
            activeTags={activeTags}
            onToggle={toggleTag}
            onClear={clearTags}
          />
        )}
        <FilterSelect
          value={currentPipeline || ALL_VALUE}
          onChange={(v) => updateParam('pipeline_stage', v === ALL_VALUE ? null : v)}
          placeholder={t('pipelinePlaceholder')}
          options={[
            { value: ALL_VALUE, label: t('allStages') },
            ...pipelineStageValues.map((v) => ({ value: v, label: tStage(v) })),
          ]}
        />
        <FilterSelect
          value={currentStatus || ALL_VALUE}
          onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
          placeholder={t('statusPlaceholder')}
          options={[
            { value: ALL_VALUE, label: t('allStatuses') },
            ...customerStatusValues.map((v) => ({ value: v, label: tStatus(v) })),
          ]}
        />
      </div>
    </div>
  );
}

function TagFilter({
  tags,
  activeTags,
  onToggle,
  onClear,
}: {
  tags: Pick<TagType, 'id' | 'name' | 'color'>[];
  activeTags: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations('crm.filters');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative col-span-2 sm:col-span-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex h-9 w-full items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors sm:w-auto ${
          activeTags.length > 0
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        <Tag className="size-3.5" aria-hidden="true" />
        {activeTags.length > 0 ? (
          <span>
            {t('tags')}
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {activeTags.length}
            </span>
          </span>
        ) : (
          t('filterByTags')
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-border bg-card py-1.5 shadow-md">
          <div className="px-3 pb-1.5 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('customerTags')}
            </p>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {tags.map((tag) => {
              const active = activeTags.includes(tag.name);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(tag.name)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card'
                      }`}
                      aria-hidden="true"
                    >
                      {active && (
                        <svg viewBox="0 0 10 8" className="size-2.5 fill-current">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-foreground">{tag.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {activeTags.length > 0 && (
            <>
              <div className="my-1 h-px bg-muted" />
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <X className="size-3.5" aria-hidden="true" />
                {t('clearAll')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 sm:min-w-[160px]">
      <Select
        value={value}
        onValueChange={(v) => onChange((v ?? '') as string)}
        items={options}
      >
        {/* Le nom accessible porte le CRITÈRE et sa valeur : « Actif » seul ne dit pas quel filtre il règle. */}
        <SelectTrigger
          className="w-full"
          aria-label={`${placeholder} : ${options.find((o) => o.value === value)?.label ?? value}`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
