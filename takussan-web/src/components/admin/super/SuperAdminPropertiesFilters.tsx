'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  PROPERTY_VISIBILITY_OPTIONS,
} from '@/components/property-form/options';

const ALL = '__all__';

interface AgencyOption {
  id: number;
  name: string;
}

interface SuperAdminPropertiesFiltersProps {
  agencies: AgencyOption[];
}

/**
 * TCK-132 — filter bar for `/super-admin/properties`. All state is mirrored in
 * the URL query string (`?filter[search]=…&filter[status]=…&…`) so views are
 * shareable. Filtering is delegated to spatie/laravel-query-builder server-side
 * — never on the already-loaded page.
 */
export function SuperAdminPropertiesFilters({ agencies }: SuperAdminPropertiesFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get('filter[search]') ?? '';
  const currentStatus = searchParams.get('filter[status]') ?? '';
  const currentType = searchParams.get('filter[type]') ?? '';
  const currentVisibility = searchParams.get('filter[visibility]') ?? '';
  const currentAgency = searchParams.get('filter[agency_id]') ?? '';

  // TCK-316 — resynchronisé sur l'URL SANS `useEffect` : l'effet rendait, puis
  // peignait l'ancienne valeur, puis re-rendait. Cf. `useStateSyncedWith`.
  const [searchInput, setSearchInput] = useStateSyncedWith(currentSearch);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL) {
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
      updateParam('filter[search]', searchInput.trim() || null);
    },
    [searchInput, updateParam],
  );

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center"
      data-testid="super-admin-properties-filters"
    >
      <form onSubmit={onSearchSubmit} className="flex-1">
        <label htmlFor="super-admin-properties-search" className="sr-only">
          Rechercher un bien
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="super-admin-properties-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Rechercher (titre, référence, description)"
            className="h-10 pl-9"
          />
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Agence"
          value={currentAgency || ALL}
          onChange={(v) => updateParam('filter[agency_id]', v === ALL ? null : v)}
          options={[
            { value: ALL, label: 'Toutes agences' },
            ...agencies.map((a) => ({ value: String(a.id), label: a.name })),
          ]}
        />
        <FilterSelect
          label="Statut"
          value={currentStatus || ALL}
          onChange={(v) => updateParam('filter[status]', v === ALL ? null : v)}
          options={[{ value: ALL, label: 'Tous statuts' }, ...PROPERTY_STATUS_OPTIONS]}
        />
        <FilterSelect
          label="Type"
          value={currentType || ALL}
          onChange={(v) => updateParam('filter[type]', v === ALL ? null : v)}
          options={[{ value: ALL, label: 'Tous types' }, ...PROPERTY_TYPE_OPTIONS]}
        />
        <FilterSelect
          label="Publication"
          value={currentVisibility || ALL}
          onChange={(v) => updateParam('filter[visibility]', v === ALL ? null : v)}
          options={[{ value: ALL, label: 'Toute visibilité' }, ...PROPERTY_VISIBILITY_OPTIONS]}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange((next ?? ALL) as string)} items={options}>
      <SelectTrigger aria-label={label} className="h-10 min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
