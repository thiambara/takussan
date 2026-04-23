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
  CONTRACT_TYPE_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
} from '@/components/property-form/options';

/**
 * Quick filters bar for the dashboard property list. All filters are
 * synced with the URL query string so the list is shareable / SSR-aware.
 * Filtering is pushed server-side via spatie `filter[...]` — never done
 * on the already-loaded client array.
 */

const ALL_VALUE = '__all__';

export function PropertyListFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') ?? '';
  const currentStatus = searchParams.get('status') ?? '';
  const currentType = searchParams.get('type') ?? '';
  const currentContract = searchParams.get('contract_type') ?? '';

  const [searchInput, setSearchInput] = useState(currentSearch);

  // Keep local input in sync when URL changes from navigation
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
      params.delete('page'); // reset pagination on filter change
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
        <label htmlFor="property-search" className="sr-only">
          Rechercher un bien
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-ink-muted"
          />
          <Input
            id="property-search"
            placeholder="Rechercher par titre, référence, description…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Statut"
          value={currentStatus || ALL_VALUE}
          onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
          placeholder="Tous"
          options={[{ value: ALL_VALUE, label: 'Tous statuts' }, ...PROPERTY_STATUS_OPTIONS]}
        />
        <FilterSelect
          label="Type"
          value={currentType || ALL_VALUE}
          onChange={(v) => updateParam('type', v === ALL_VALUE ? null : v)}
          placeholder="Tous"
          options={[{ value: ALL_VALUE, label: 'Tous types' }, ...PROPERTY_TYPE_OPTIONS]}
        />
        <FilterSelect
          label="Contrat"
          value={currentContract || ALL_VALUE}
          onChange={(v) => updateParam('contract_type', v === ALL_VALUE ? null : v)}
          placeholder="Tous"
          options={[
            { value: ALL_VALUE, label: 'Vente & location' },
            ...CONTRACT_TYPE_OPTIONS,
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="min-w-[160px]">
      <label className="sr-only">{label}</label>
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
