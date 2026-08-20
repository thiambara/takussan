'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  contractTypeValues,
  propertyStatusValues,
  propertyTypeValues,
} from '@/lib/schemas/property';
import {
  PROPERTY_ENUM_NAMESPACES,
  contractTypeOptions,
  enumLabel,
  propertyStatusOptions,
  propertyTypeOptions,
  type Traducteur,
} from '@/components/property-form/options';

/**
 * Quick filters bar for the dashboard property list. Primary controls stay
 * visible (search, sort, scope toggles); advanced controls live behind a
 * disclosure to reduce noise. All state is URL-synced so the list is
 * shareable / SSR-aware. Filtering is pushed server-side via spatie
 * `filter[...]` — never done on the already-loaded client array.
 */

const ALL_VALUE = '__all__';

/**
 * Le tri porte une CLÉ de libellé, pas un libellé (patron TCK-286). La valeur, elle, est le
 * paramètre `sort=` envoyé au backend : les deux ne se confondent pas et ne se dérivent pas
 * l'une de l'autre.
 */
const SORT_OPTIONS = [
  { value: '-created_at', labelKey: 'newest' },
  { value: 'created_at', labelKey: 'oldest' },
  { value: 'price', labelKey: 'priceAsc' },
  { value: '-price', labelKey: 'priceDesc' },
  { value: '-views_count', labelKey: 'viewsDesc' },
  { value: 'views_count', labelKey: 'viewsAsc' },
] as const;

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
  const t = useTranslations('property.dashboard.filters');
  const tChips = useTranslations('property.dashboard.filters.chips');
  const tList = useTranslations('property.dashboard.list');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const tContract = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const tScope = useTranslations(PROPERTY_ENUM_NAMESPACES.visibilityScope);
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

  const sortOptions = SORT_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t(`sort.${opt.labelKey}`),
  }));

  const activeFilters = useMemo(
    () =>
      buildActiveChips(searchParams, {
        currentUserId,
        agentOptions,
        tChips,
        tStatus,
        tType,
        tContract,
        tScope,
      }),
    [
      searchParams,
      currentUserId,
      agentOptions,
      tChips,
      tStatus,
      tType,
      tContract,
      tScope,
    ],
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
            {t('searchLabel')}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-ink-muted"
          />
          <Input
            id="property-search"
            name="search"
            placeholder={t('searchPlaceholder')}
            className="pl-9"
            defaultValue={currentSearch}
            key={currentSearch}
          />
        </form>

        <div className="min-w-[180px]">
          <label className="sr-only">{t('sortLabel')}</label>
          <Select
            value={currentSort}
            onValueChange={(v) => updateParam('sort', (v ?? '-created_at') as string)}
            items={sortOptions}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('sortPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Toggle
          label={t('toggleMine')}
          checked={onlyMine}
          onChange={(checked) =>
            updateParams({
              only_mine: checked ? '1' : null,
              user_id: checked ? null : currentAgent || null,
            })
          }
        />

        <Toggle
          label={t('toggleArchived')}
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
          {t('advanced')}
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
              <span className="sr-only">
                {t('removeChip', { label: chip.label })}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetAll}
            className="text-xs font-medium text-app-accent hover:underline"
          >
            {t('resetAll')}
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
              aria-label={t('cityAria')}
              name="city"
              placeholder={t('cityPlaceholder')}
              defaultValue={currentCity}
              key={`city-${currentCity}`}
            />
            <Input
              aria-label={t('priceMinAria')}
              name="price_min"
              inputMode="numeric"
              placeholder={t('priceMinPlaceholder')}
              defaultValue={currentPriceMin}
              key={`pmin-${currentPriceMin}`}
            />
            <Input
              aria-label={t('priceMaxAria')}
              name="price_max"
              inputMode="numeric"
              placeholder={t('priceMaxPlaceholder')}
              defaultValue={currentPriceMax}
              key={`pmax-${currentPriceMax}`}
            />
            <Button type="submit" variant="outline" size="sm">
              {t('apply')}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label={t('statusLabel')}
              value={currentStatus || ALL_VALUE}
              onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
              placeholder={t('statusAll')}
              options={[
                { value: ALL_VALUE, label: t('statusAll') },
                ...propertyStatusOptions(tStatus),
              ]}
            />
            <FilterSelect
              label={t('typeLabel')}
              value={currentType || ALL_VALUE}
              onChange={(v) => updateParam('type', v === ALL_VALUE ? null : v)}
              placeholder={t('typeAll')}
              options={[
                { value: ALL_VALUE, label: t('typeAll') },
                ...propertyTypeOptions(tType),
              ]}
            />
            <FilterSelect
              label={t('contractLabel')}
              value={currentContract || ALL_VALUE}
              onChange={(v) => updateParam('contract_type', v === ALL_VALUE ? null : v)}
              placeholder={t('contractAll')}
              options={[
                { value: ALL_VALUE, label: t('contractAll') },
                ...contractTypeOptions(tContract),
              ]}
            />
            <FilterSelect
              label={t('visibilityLabel')}
              value={currentVisibility || ALL_VALUE}
              onChange={(v) => updateParam('visibility', v === ALL_VALUE ? null : v)}
              placeholder={t('visibilityAll')}
              options={[
                { value: ALL_VALUE, label: t('visibilityAll') },
                { value: 'public', label: tScope('public') },
                { value: 'private', label: tScope('private') },
              ]}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label={t('agentLabel')}
              value={onlyMine ? String(currentUserId) : currentAgent || ALL_VALUE}
              onChange={(v) =>
                updateParams({
                  user_id: v === ALL_VALUE ? null : v,
                  only_mine: null,
                })
              }
              placeholder={t('agentAll')}
              options={[
                { value: ALL_VALUE, label: t('agentAll') },
                ...agentOptions.map((agent) => ({
                  value: String(agent.id),
                  label:
                    agent.id === currentUserId
                      ? tList('agentSelf', { name: agent.name })
                      : agent.name,
                })),
              ]}
            />
            <div>
              <label className="mb-1 block text-xs text-app-ink-muted">
                {t('createdFrom')}
              </label>
              <DatePicker
                aria-label={t('createdFrom')}
                value={currentCreatedFrom}
                onValueChange={(value) => updateParam('created_from', value || null)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-app-ink-muted">
                {t('createdTo')}
              </label>
              <DatePicker
                aria-label={t('createdTo')}
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

/**
 * Fabrique les puces de filtre actif.
 *
 * Fonction de module — donc un endroit où `useTranslations` n'est PAS appelable. Comme
 * `SearchToolbar.fabriqueEtiquettes` (TCK-292), elle reçoit les traducteurs déjà bornés à leur
 * espace de noms et les applique elle-même. Ce n'est pas un contournement : c'est la forme que
 * prend « la donnée porte la clé, le rendu la résout » quand la donnée est calculée.
 */
function buildActiveChips(
  searchParams: URLSearchParams,
  ctx: {
    readonly currentUserId: number;
    readonly agentOptions: readonly { id: number; name: string }[];
    readonly tChips: Traducteur;
    readonly tStatus: Traducteur;
    readonly tType: Traducteur;
    readonly tContract: Traducteur;
    readonly tScope: Traducteur;
  },
): { key: string; label: string; value: string }[] {
  const chips: { key: string; label: string; value: string }[] = [];
  const search = searchParams.get('search');
  if (search) chips.push({ key: 'search', label: ctx.tChips('search'), value: search });
  const status = searchParams.get('status');
  if (status) {
    chips.push({ key: 'status', label: ctx.tChips('status'), value: enumLabel(ctx.tStatus, propertyStatusValues, status) });
  }
  const type = searchParams.get('type');
  if (type) {
    chips.push({ key: 'type', label: ctx.tChips('type'), value: enumLabel(ctx.tType, propertyTypeValues, type) });
  }
  const contract = searchParams.get('contract_type');
  if (contract) {
    chips.push({
      key: 'contract_type',
      label: ctx.tChips('contract'),
      value: enumLabel(ctx.tContract, contractTypeValues, contract),
    });
  }
  const visibility = searchParams.get('visibility');
  if (visibility) {
    chips.push({
      key: 'visibility',
      label: ctx.tChips('visibility'),
      value: ctx.tScope(visibility === 'public' ? 'public' : 'private'),
    });
  }
  const city = searchParams.get('city');
  if (city) chips.push({ key: 'city', label: ctx.tChips('city'), value: city });
  const priceMin = searchParams.get('price_min');
  if (priceMin) chips.push({ key: 'price_min', label: ctx.tChips('priceMin'), value: priceMin });
  const priceMax = searchParams.get('price_max');
  if (priceMax) chips.push({ key: 'price_max', label: ctx.tChips('priceMax'), value: priceMax });
  const createdFrom = searchParams.get('created_from');
  if (createdFrom) {
    chips.push({ key: 'created_from', label: ctx.tChips('createdFrom'), value: createdFrom });
  }
  const createdTo = searchParams.get('created_to');
  if (createdTo) {
    chips.push({ key: 'created_to', label: ctx.tChips('createdTo'), value: createdTo });
  }
  const userId = searchParams.get('user_id');
  if (userId) {
    const agent = ctx.agentOptions.find((a) => String(a.id) === userId);
    chips.push({ key: 'user_id', label: ctx.tChips('agent'), value: agent?.name ?? userId });
  }
  return chips;
}
