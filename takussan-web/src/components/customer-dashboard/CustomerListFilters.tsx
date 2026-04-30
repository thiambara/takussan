'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Tag, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CUSTOMER_STATUS_OPTIONS,
  PIPELINE_STAGE_OPTIONS,
} from '@/components/customer-form/options';
import type { Tag as TagType } from '@/types/tag';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') ?? '';
  const currentStatus = searchParams.get('status') ?? '';
  const currentPipeline = searchParams.get('pipeline_stage') ?? '';
  const currentTagsParam = searchParams.get('tags') ?? '';

  const activeTags = currentTagsParam ? currentTagsParam.split(',').filter(Boolean) : [];

  const [searchInput, setSearchInput] = useState(currentSearch);

  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL_VALUE) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const onSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      updateParam('search', searchInput.trim() || null);
    },
    [searchInput, updateParam],
  );

  const toggleTag = useCallback(
    (name: string) => {
      const next = activeTags.includes(name)
        ? activeTags.filter((t) => t !== name)
        : [...activeTags, name];
      updateParam('tags', next.length > 0 ? next.join(',') : null);
    },
    [activeTags, updateParam],
  );

  const clearTags = useCallback(() => {
    updateParam('tags', null);
  }, [updateParam]);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-app-surface-1 p-4 md:flex-row md:items-center">
      <form onSubmit={onSearchSubmit} className="flex-1">
        <label htmlFor="customer-search" className="sr-only">
          Rechercher un client
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-ink-muted"
          />
          <Input
            id="customer-search"
            placeholder="Nom, prénom, e-mail, téléphone…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
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
          placeholder="Pipeline"
          options={[
            { value: ALL_VALUE, label: 'Tous' },
            ...PIPELINE_STAGE_OPTIONS,
          ]}
        />
        <FilterSelect
          value={currentStatus || ALL_VALUE}
          onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
          placeholder="Statut"
          options={[
            { value: ALL_VALUE, label: 'Tous' },
            ...CUSTOMER_STATUS_OPTIONS,
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
          activeTags.length > 0
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-app-surface-3 bg-white text-app-ink hover:bg-app-surface-1'
        }`}
      >
        <Tag className="size-3.5" aria-hidden="true" />
        {activeTags.length > 0 ? (
          <span>
            Tags
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
              {activeTags.length}
            </span>
          </span>
        ) : (
          'Filtrer par tags'
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-app-surface-3 bg-white py-1.5 shadow-md">
          <div className="px-3 pb-1.5 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
              Tags clients
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
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-app-surface-1"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-app-surface-3 bg-white'
                      }`}
                      aria-hidden="true"
                    >
                      {active && (
                        <svg viewBox="0 0 10 8" className="size-2.5 fill-current">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-app-ink">{tag.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {activeTags.length > 0 && (
            <>
              <div className="my-1 h-px bg-app-surface-2" />
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <X className="size-3.5" />
                Tout effacer
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
    <div className="min-w-[160px]">
      <Select
        value={value}
        onValueChange={(v) => onChange((v ?? '') as string)}
        items={options}
      >
        <SelectTrigger className="w-full">
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
