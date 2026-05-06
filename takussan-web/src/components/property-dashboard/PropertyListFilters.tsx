'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

export function PropertyListFilters({
  currentUserId,
  agentOptions = [],
}: {
  readonly currentUserId: number;
  readonly agentOptions?: readonly { id: number; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') ?? '';
  const currentCity = searchParams.get('city') ?? '';
  const currentStatus = searchParams.get('status') ?? '';
  const currentType = searchParams.get('type') ?? '';
  const currentContract = searchParams.get('contract_type') ?? '';
  const currentAgent = searchParams.get('user_id') ?? '';
  const currentPriceMin = searchParams.get('price_min') ?? '';
  const currentPriceMax = searchParams.get('price_max') ?? '';
  const currentCreatedFrom = searchParams.get('created_from') ?? '';
  const currentCreatedTo = searchParams.get('created_to') ?? '';
  const currentSort = searchParams.get('sort') ?? '-created_at';
  const includeArchived = searchParams.get('include_archived') === '1';
  const onlyMine = searchParams.get('only_mine') === '1';

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== ALL_VALUE) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      params.delete('page'); // reset pagination on filter change
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const updateParam = useCallback(
    (key: string, value: string | null) => updateParams({ [key]: value }),
    [updateParams],
  );

  const onSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      updateParams({
        search: String(form.get('search') ?? '').trim() || null,
        city: String(form.get('city') ?? '').trim() || null,
        price_min: String(form.get('price_min') ?? '').trim() || null,
        price_max: String(form.get('price_max') ?? '').trim() || null,
      });
    },
    [updateParams],
  );

  return (
    <div className="space-y-3 rounded-xl bg-app-surface-1 p-4">
      <form onSubmit={onSearchSubmit} className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_auto]">
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
            name="search"
            placeholder="Rechercher par titre, référence, description…"
            className="pl-9"
            defaultValue={currentSearch}
          />
        </div>
        <Input
          aria-label="Ville"
          name="city"
          placeholder="Ville"
          defaultValue={currentCity}
        />
        <Input
          aria-label="Prix minimum"
          name="price_min"
          inputMode="numeric"
          placeholder="Prix min"
          defaultValue={currentPriceMin}
        />
        <Input
          aria-label="Prix maximum"
          name="price_max"
          inputMode="numeric"
          placeholder="Prix max"
          defaultValue={currentPriceMax}
        />
        <Button
          type="submit"
        >
          Filtrer
        </Button>
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
        <FilterSelect
          label="Agent assigné"
          value={onlyMine ? String(currentUserId) : currentAgent || ALL_VALUE}
          onChange={(v) =>
            updateParams({
              user_id: v === ALL_VALUE ? null : v,
              only_mine: null,
            })
          }
          placeholder="Agent"
          options={[
            { value: ALL_VALUE, label: 'Tous agents' },
            ...agentOptions.map((agent) => ({
              value: String(agent.id),
              label: agent.id === currentUserId ? `${agent.name} (moi)` : agent.name,
            })),
          ]}
        />
        <Input
          aria-label="Créé après"
          type="date"
          value={currentCreatedFrom}
          onChange={(e) => updateParam('created_from', e.target.value || null)}
          className="w-[150px]"
        />
        <Input
          aria-label="Créé avant"
          type="date"
          value={currentCreatedTo}
          onChange={(e) => updateParam('created_to', e.target.value || null)}
          className="w-[150px]"
        />
        <FilterSelect
          label="Tri"
          value={currentSort}
          onChange={(v) => updateParam('sort', v)}
          placeholder="Tri"
          options={[
            { value: '-created_at', label: 'Plus récents' },
            { value: 'created_at', label: 'Plus anciens' },
            { value: 'price', label: 'Prix croissant' },
            { value: '-price', label: 'Prix décroissant' },
            { value: '-views_count', label: 'Vues décroissantes' },
            { value: 'views_count', label: 'Vues croissantes' },
          ]}
        />
        <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-app-ink">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(event) =>
              updateParams({
                only_mine: event.target.checked ? '1' : null,
                user_id: event.target.checked ? null : currentAgent || null,
              })
            }
            className="size-4 rounded border-stone-300"
          />
          Uniquement les miens
        </label>
        <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-app-ink">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => updateParam('include_archived', event.target.checked ? '1' : null)}
            className="size-4 rounded border-stone-300"
          />
          Inclure les archivés
        </label>
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
