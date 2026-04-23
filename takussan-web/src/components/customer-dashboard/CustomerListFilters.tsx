'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

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

/**
 * CRM filters bar. Same rules as the property filters: every filter is
 * round-tripped through the URL and pushed to the backend via spatie
 * `filter[...]`.
 */

const ALL_VALUE = '__all__';

export function CustomerListFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') ?? '';
  const currentStatus = searchParams.get('status') ?? '';
  const currentPipeline = searchParams.get('pipeline_stage') ?? '';

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
        <FilterSelect
          value={currentPipeline || ALL_VALUE}
          onChange={(v) => updateParam('pipeline_stage', v === ALL_VALUE ? null : v)}
          placeholder="Pipeline"
          options={[
            { value: ALL_VALUE, label: 'Toutes étapes' },
            ...PIPELINE_STAGE_OPTIONS,
          ]}
        />
        <FilterSelect
          value={currentStatus || ALL_VALUE}
          onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
          placeholder="Statut"
          options={[
            { value: ALL_VALUE, label: 'Tous statuts' },
            ...CUSTOMER_STATUS_OPTIONS,
          ]}
        />
      </div>
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
