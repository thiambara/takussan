'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_OPTIONS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPE_OPTIONS,
} from '@/components/property-form/options';

/**
 * Quick filters bar for the dashboard property list. Primary controls stay
 * visible (search, sort, scope toggles); advanced controls live behind a
 * disclosure to reduce noise. All state is URL-synced so the list is
 * shareable / SSR-aware. Filtering is pushed server-side via spatie
 * `filter[...]` — never done on the already-loaded client array.
 */

const ALL_VALUE = '__all__';

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Plus récents' },
  { value: 'created_at', label: 'Plus anciens' },
  { value: 'price', label: 'Prix croissant' },
  { value: '-price', label: 'Prix décroissant' },
  { value: '-views_count', label: 'Vues décroissantes' },
  { value: 'views_count', label: 'Vues croissantes' },
];

const ADVANCED_KEYS = [
  'city',
  'price_min',
  'price_max',
  'status',
  'type',
  'contract_type',
  'visibility',
  'user_id',
  'created_from',
  'created_to',
] as const;

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
  const currentVisibility = searchParams.get('visibility') ?? '';
  const currentAgent = searchParams.get('user_id') ?? '';
  const currentPriceMin = searchParams.get('price_min') ?? '';
  const currentPriceMax = searchParams.get('price_max') ?? '';
  const currentCreatedFrom = searchParams.get('created_from') ?? '';
  const currentCreatedTo = searchParams.get('created_to') ?? '';
  const currentSort = searchParams.get('sort') ?? '-created_at';
  const includeArchived = searchParams.get('include_archived') === '1';
  const onlyMine = searchParams.get('only_mine') === '1';

  const activeFilters = useMemo(
    () =>
      buildActiveChips(searchParams, {
        currentUserId,
        agentOptions,
      }),
    [searchParams, currentUserId, agentOptions],
  );

  const advancedActiveCount = useMemo(
    () =>
      ADVANCED_KEYS.reduce(
        (acc, key) => acc + (searchParams.get(key) ? 1 : 0),
        0,
      ),
    [searchParams],
  );

  const [advancedOpen, setAdvancedOpen] = useState(advancedActiveCount > 0);

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
      });
    },
    [updateParams],
  );

  const onAdvancedSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      updateParams({
        city: String(form.get('city') ?? '').trim() || null,
        price_min: String(form.get('price_min') ?? '').trim() || null,
        price_max: String(form.get('price_max') ?? '').trim() || null,
      });
    },
    [updateParams],
  );

  const resetAll = useCallback(() => {
    router.replace('?');
  }, [router]);

  return (
    <div className="space-y-3 rounded-xl bg-app-surface-1 p-4">
      {/* Row 1 — primary controls */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={onSearchSubmit} className="relative min-w-[240px] flex-1">
          <label htmlFor="property-search" className="sr-only">
            Rechercher un bien
          </label>
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
            key={currentSearch}
          />
        </form>

        <div className="min-w-[180px]">
          <label className="sr-only">Tri</label>
          <Select
            value={currentSort}
            onValueChange={(v) => updateParam('sort', (v ?? '-created_at') as string)}
            items={SORT_OPTIONS}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tri" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Toggle
          label="Mes biens"
          checked={onlyMine}
          onChange={(checked) =>
            updateParams({
              only_mine: checked ? '1' : null,
              user_id: checked ? null : currentAgent || null,
            })
          }
        />

        <Toggle
          label="Archivés"
          checked={includeArchived}
          onChange={(checked) => updateParam('include_archived', checked ? '1' : null)}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Filtres avancés
          {advancedActiveCount > 0 ? (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-app-accent/20 px-1.5 text-xs font-semibold text-app-accent">
              {advancedActiveCount}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
          />
        </Button>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => updateParam(chip.key, null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-app-surface-2 px-2.5 py-1 text-xs text-app-ink hover:bg-app-surface-3"
            >
              <span className="text-app-ink-muted">{chip.label}:</span>
              <span className="font-medium">{chip.value}</span>
              <X aria-hidden="true" className="size-3 text-app-ink-muted" />
              <span className="sr-only">Retirer le filtre {chip.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetAll}
            className="text-xs font-medium text-app-accent hover:underline"
          >
            Tout réinitialiser
          </button>
        </div>
      ) : null}

      {/* Row 2 — advanced filters (collapsible) */}
      {advancedOpen ? (
        <form
          onSubmit={onAdvancedSubmit}
          className="space-y-3 border-t border-app-surface-2/70 pt-3"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              aria-label="Ville"
              name="city"
              placeholder="Ville"
              defaultValue={currentCity}
              key={`city-${currentCity}`}
            />
            <Input
              aria-label="Prix minimum"
              name="price_min"
              inputMode="numeric"
              placeholder="Prix min"
              defaultValue={currentPriceMin}
              key={`pmin-${currentPriceMin}`}
            />
            <Input
              aria-label="Prix maximum"
              name="price_max"
              inputMode="numeric"
              placeholder="Prix max"
              defaultValue={currentPriceMax}
              key={`pmax-${currentPriceMax}`}
            />
            <Button type="submit" variant="outline" size="sm">
              Appliquer
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Statut"
              value={currentStatus || ALL_VALUE}
              onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
              placeholder="Tous statuts"
              options={[{ value: ALL_VALUE, label: 'Tous statuts' }, ...PROPERTY_STATUS_OPTIONS]}
            />
            <FilterSelect
              label="Type"
              value={currentType || ALL_VALUE}
              onChange={(v) => updateParam('type', v === ALL_VALUE ? null : v)}
              placeholder="Tous types"
              options={[{ value: ALL_VALUE, label: 'Tous types' }, ...PROPERTY_TYPE_OPTIONS]}
            />
            <FilterSelect
              label="Contrat"
              value={currentContract || ALL_VALUE}
              onChange={(v) => updateParam('contract_type', v === ALL_VALUE ? null : v)}
              placeholder="Vente & location"
              options={[
                { value: ALL_VALUE, label: 'Vente & location' },
                ...CONTRACT_TYPE_OPTIONS,
              ]}
            />
            <FilterSelect
              label="Visibilité"
              value={currentVisibility || ALL_VALUE}
              onChange={(v) => updateParam('visibility', v === ALL_VALUE ? null : v)}
              placeholder="Toutes"
              options={[
                { value: ALL_VALUE, label: 'Toutes' },
                { value: 'public', label: 'Public' },
                { value: 'private', label: 'Privé' },
              ]}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Agent assigné"
              value={onlyMine ? String(currentUserId) : currentAgent || ALL_VALUE}
              onChange={(v) =>
                updateParams({
                  user_id: v === ALL_VALUE ? null : v,
                  only_mine: null,
                })
              }
              placeholder="Tous agents"
              options={[
                { value: ALL_VALUE, label: 'Tous agents' },
                ...agentOptions.map((agent) => ({
                  value: String(agent.id),
                  label: agent.id === currentUserId ? `${agent.name} (moi)` : agent.name,
                })),
              ]}
            />
            <div>
              <label className="mb-1 block text-xs text-app-ink-muted">Créé après</label>
              <DatePicker
                aria-label="Créé après"
                value={currentCreatedFrom}
                onValueChange={(value) => updateParam('created_from', value || null)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-app-ink-muted">Créé avant</label>
              <DatePicker
                aria-label="Créé avant"
                value={currentCreatedTo}
                onValueChange={(value) => updateParam('created_to', value || null)}
              />
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors',
        checked
          ? 'bg-app-accent/15 text-app-ink'
          : 'bg-app-surface-2/50 text-app-ink-muted hover:bg-app-surface-2',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-stone-300"
      />
      {label}
    </label>
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
    <div>
      <label className="mb-1 block text-xs text-app-ink-muted">{label}</label>
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

function buildActiveChips(
  searchParams: URLSearchParams,
  ctx: {
    readonly currentUserId: number;
    readonly agentOptions: readonly { id: number; name: string }[];
  },
): { key: string; label: string; value: string }[] {
  const chips: { key: string; label: string; value: string }[] = [];
  const search = searchParams.get('search');
  if (search) chips.push({ key: 'search', label: 'Recherche', value: search });
  const status = searchParams.get('status');
  if (status) {
    const k = status as keyof typeof PROPERTY_STATUS_LABELS;
    chips.push({ key: 'status', label: 'Statut', value: PROPERTY_STATUS_LABELS[k] ?? status });
  }
  const type = searchParams.get('type');
  if (type) {
    const k = type as keyof typeof PROPERTY_TYPE_LABELS;
    chips.push({ key: 'type', label: 'Type', value: PROPERTY_TYPE_LABELS[k] ?? type });
  }
  const contract = searchParams.get('contract_type');
  if (contract) {
    const k = contract as keyof typeof CONTRACT_TYPE_LABELS;
    chips.push({ key: 'contract_type', label: 'Contrat', value: CONTRACT_TYPE_LABELS[k] ?? contract });
  }
  const visibility = searchParams.get('visibility');
  if (visibility) {
    chips.push({
      key: 'visibility',
      label: 'Visibilité',
      value: visibility === 'public' ? 'Public' : 'Privé',
    });
  }
  const city = searchParams.get('city');
  if (city) chips.push({ key: 'city', label: 'Ville', value: city });
  const priceMin = searchParams.get('price_min');
  if (priceMin) chips.push({ key: 'price_min', label: 'Prix min', value: priceMin });
  const priceMax = searchParams.get('price_max');
  if (priceMax) chips.push({ key: 'price_max', label: 'Prix max', value: priceMax });
  const createdFrom = searchParams.get('created_from');
  if (createdFrom) chips.push({ key: 'created_from', label: 'Créé après', value: createdFrom });
  const createdTo = searchParams.get('created_to');
  if (createdTo) chips.push({ key: 'created_to', label: 'Créé avant', value: createdTo });
  const userId = searchParams.get('user_id');
  if (userId) {
    const agent = ctx.agentOptions.find((a) => String(a.id) === userId);
    chips.push({ key: 'user_id', label: 'Agent', value: agent?.name ?? userId });
  }
  return chips;
}
