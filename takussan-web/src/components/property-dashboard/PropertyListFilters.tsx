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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { fieldDensityScope } from '@/components/ui/field-density';
import { cn } from '@/lib/utils';
import {
  contractTypeValues,
  propertyStatusValues,
  propertyTypeValues,
} from '@/lib/enums/property';
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
 *
 * TCK-644 — sous `lg`, seule la recherche reste à l'écran ; le tri, les deux cases et les
 * critères passent dans une feuille du bas, derrière un bouton « Filtres » qui compte les filtres
 * actifs. **Les commandes de la feuille appellent les MÊMES `updateParam(s)` que la barre
 * d'ordinateur** : elles ne fabriquent aucune URL à elles, c'est ce qui garantit qu'un filtre
 * déplacé produit la même requête (éprouvé commande par commande dans
 * `PropertyListFilters.mobile.tck-644.test.tsx`).
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

/**
 * Ce que compte le bouton « Filtres » de la feuille : les critères avancés et les deux cases.
 * Ni la recherche — elle reste visible au-dessus — ni le tri, qui ordonne la liste sans la
 * restreindre.
 */
const SCOPE_KEYS = ['only_mine', 'include_archived'] as const;

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
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtresActifs =
    advancedActiveCount + SCOPE_KEYS.filter((key) => searchParams.get(key) === '1').length;

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

  /** La feuille applique la saisie libre (ville, prix) comme « Appliquer », puis se referme. */
  const onSheetSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    onAdvancedSubmit(e);
    setSheetOpen(false);
  };

  const toggleMine = (checked: boolean) =>
    updateParams({
      only_mine: checked ? '1' : null,
      user_id: checked ? null : currentAgent || null,
    });

  const toggleArchived = (checked: boolean) =>
    updateParam('include_archived', checked ? '1' : null);

  const resetAll = useCallback(() => {
    router.replace('?');
  }, [router]);

  const criteresProps = {
    t,
    tList,
    tStatus,
    tType,
    tContract,
    tScope,
    currentUserId,
    agentOptions,
    valeurs: {
      city: currentCity,
      priceMin: currentPriceMin,
      priceMax: currentPriceMax,
      status: currentStatus,
      type: currentType,
      contract: currentContract,
      visibility: currentVisibility,
      agent: onlyMine ? String(currentUserId) : currentAgent,
      createdFrom: currentCreatedFrom,
      createdTo: currentCreatedTo,
    },
    updateParam,
    updateParams,
  };

  return (
    // TCK-644 — sous `lg`, plus de carte : la recherche se pose seule sur le fond de page, à côté
    // d'UN bouton « Filtres » qui ouvre la feuille du bas. À 390 px, l'ancienne carte empilait
    // recherche, tri, deux cases et « Filtres avancés » sur quatre rangées, et poussait la
    // première carte de bien sous le pli. Dès `lg`, la carte et sa rangée d'origine reviennent.
    <div className="space-y-3 lg:rounded-xl lg:bg-card lg:p-4">
      {/* Row 1 — primary controls */}
      <div className="flex items-center gap-2 lg:flex-wrap">
        <form onSubmit={onSearchSubmit} className="relative min-w-0 flex-1 lg:min-w-[240px]">
          <label htmlFor="property-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="property-search"
            name="search"
            type="search"
            enterKeyHint="search"
            placeholder={t('searchPlaceholder')}
            className="h-11 rounded-xl bg-card pl-9 shadow-xs lg:h-8 lg:rounded-lg lg:bg-transparent lg:shadow-none"
            defaultValue={currentSearch}
            key={currentSearch}
          />
        </form>

        {/* Sous `lg` : tri, cases et filtres avancés derrière ce seul bouton. Son nom accessible
            CONTIENT le libellé visible (WCAG 2.5.3) et dit combien de filtres sont posés. */}
        <Button
          type="button"
          variant="outline"
          aria-label={t('mobile.buttonAria', { count: filtresActifs })}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className={cn(
            'h-11 shrink-0 gap-2 rounded-xl bg-card px-3.5 shadow-xs lg:hidden',
            filtresActifs > 0 && 'border-primary/40 text-primary',
          )}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          <span>{t('mobile.button')}</span>
          {filtresActifs > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {filtresActifs}
            </span>
          ) : null}
        </Button>

        <div data-testid="filtres-ordinateur" className="hidden lg:contents">
          <div className="min-w-[180px] flex-none">
            <Select
              value={currentSort}
              onValueChange={(v) => updateParam('sort', (v ?? '-created_at') as string)}
              items={sortOptions}
            >
              <SelectTrigger className="w-full" aria-label={t('sortLabel')}>
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

          <Toggle label={t('toggleMine')} checked={onlyMine} onChange={toggleMine} />

          <Toggle label={t('toggleArchived')} checked={includeArchived} onChange={toggleArchived} />

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {t('advanced')}
            {advancedActiveCount > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs font-semibold text-primary">
                {advancedActiveCount}
              </span>
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
            />
          </Button>
        </div>
      </div>

      {/* Active filter chips — une rangée qui défile de bord à bord sous `lg` (elle sort de la
          marge de la coque, `-mx-4`/`md:-mx-6`), qui passe à la ligne dès `lg`. */}
      {activeFilters.length > 0 ? (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {activeFilters.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => updateParam(chip.key, null)}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-3 py-1 text-xs text-foreground outline-none transition-colors hover:bg-border focus-visible:ring-3 focus-visible:ring-ring lg:min-h-7 lg:px-2.5"
            >
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className="font-medium">{chip.value}</span>
              <X aria-hidden="true" className="size-3 text-muted-foreground" />
              <span className="sr-only">
                {t('removeChip', { label: chip.label })}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetAll}
            className="shrink-0 whitespace-nowrap rounded-sm text-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('resetAll')}
          </button>
        </div>
      ) : null}

      {/* Row 2 — advanced filters (collapsible), ordinateur seulement : sous `lg`, ils vivent
          dans la feuille. */}
      {advancedOpen ? (
        <form
          data-testid="filtres-avances-ordinateur"
          onSubmit={onAdvancedSubmit}
          className="hidden space-y-3 border-t border-muted/70 pt-3 lg:block"
        >
          <CriteresAvances disposition="ordinateur" {...criteresProps} />
        </form>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] rounded-t-3xl"
        >
          <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" />
          <SheetHeader className="flex-row items-start justify-between gap-4 px-5 pt-3 pb-4">
            <div className="min-w-0">
              <SheetTitle className="font-display text-xl font-semibold tracking-tight">
                {t('mobile.title')}
              </SheetTitle>
              <SheetDescription className="mt-0.5">{t('mobile.description')}</SheetDescription>
            </div>
            {filtresActifs > 0 || activeFilters.length > 0 ? (
              <button
                type="button"
                onClick={resetAll}
                className="mt-1 shrink-0 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
              >
                {t('resetAll')}
              </button>
            ) : null}
          </SheetHeader>

          <form onSubmit={onSheetSubmit} className="flex min-h-0 flex-1 flex-col">
            <div
              {...fieldDensityScope()}
              className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-5 pb-6"
            >
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-foreground">
                  {t('mobile.sortHeading')}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {sortOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-muted/60 px-3 text-center text-sm text-foreground transition-colors has-checked:bg-primary has-checked:font-medium has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring"
                    >
                      <input
                        type="radio"
                        name="tri-mobile"
                        value={opt.value}
                        checked={currentSort === opt.value}
                        onChange={() => updateParam('sort', opt.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-sm font-semibold text-foreground">
                  {t('mobile.scopeHeading')}
                </legend>
                <div className="divide-y divide-border">
                  <LigneACocher label={t('toggleMine')} checked={onlyMine} onChange={toggleMine} />
                  <LigneACocher
                    label={t('toggleArchived')}
                    checked={includeArchived}
                    onChange={toggleArchived}
                  />
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm font-semibold text-foreground">
                  {t('mobile.criteriaHeading')}
                </legend>
                <CriteresAvances disposition="feuille" {...criteresProps} />
              </fieldset>
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base">
                {t('mobile.showResults')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
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
        'inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring',
        checked
          ? 'bg-primary/15 text-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border"
      />
      {label}
    </label>
  );
}

/** La case de la feuille : une ligne entière au pouce, libellé à gauche, case à droite. */
function LigneACocher({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 text-sm text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 cursor-pointer rounded border-border accent-primary"
      />
    </label>
  );
}

interface CriteresAvancesProps {
  /** `ordinateur` : les trois grilles d'origine, avec « Appliquer ». `feuille` : une colonne
   *  au pouce, sans bouton — le pied de la feuille valide. */
  readonly disposition: 'ordinateur' | 'feuille';
  readonly t: ReturnType<typeof useTranslations<'property.dashboard.filters'>>;
  readonly tList: ReturnType<typeof useTranslations<'property.dashboard.list'>>;
  readonly tStatus: Traducteur;
  readonly tType: Traducteur;
  readonly tContract: Traducteur;
  readonly tScope: Traducteur;
  readonly currentUserId: number;
  readonly agentOptions: readonly { id: number; name: string }[];
  readonly valeurs: {
    readonly city: string;
    readonly priceMin: string;
    readonly priceMax: string;
    readonly status: string;
    readonly type: string;
    readonly contract: string;
    readonly visibility: string;
    readonly agent: string;
    readonly createdFrom: string;
    readonly createdTo: string;
  };
  readonly updateParam: (key: string, value: string | null) => void;
  readonly updateParams: (updates: Record<string, string | null>) => void;
}

/**
 * Les critères avancés, UNE fois pour les deux emplacements (TCK-644) : la barre d'ordinateur et
 * la feuille du bas ne diffèrent que par la grille. Deux copies auraient fini par ne plus envoyer
 * la même requête.
 */
function CriteresAvances({
  disposition,
  t,
  tList,
  tStatus,
  tType,
  tContract,
  tScope,
  currentUserId,
  agentOptions,
  valeurs,
  updateParam,
  updateParams,
}: CriteresAvancesProps) {
  const feuille = disposition === 'feuille';
  const grille = feuille ? 'grid grid-cols-2 gap-3' : 'grid gap-2 sm:grid-cols-2 lg:grid-cols-4';
  const pleineLargeur = feuille ? 'col-span-2' : undefined;
  return (
    <>
      <div className={grille}>
        <Input
          aria-label={t('cityAria')}
          name="city"
          placeholder={t('cityPlaceholder')}
          defaultValue={valeurs.city}
          key={`city-${valeurs.city}`}
          className={pleineLargeur}
        />
        <Input
          aria-label={t('priceMinAria')}
          name="price_min"
          inputMode="numeric"
          placeholder={t('priceMinPlaceholder')}
          defaultValue={valeurs.priceMin}
          key={`pmin-${valeurs.priceMin}`}
        />
        <Input
          aria-label={t('priceMaxAria')}
          name="price_max"
          inputMode="numeric"
          placeholder={t('priceMaxPlaceholder')}
          defaultValue={valeurs.priceMax}
          key={`pmax-${valeurs.priceMax}`}
        />
        {feuille ? null : (
          <Button type="submit" variant="outline" size="sm">
            {t('apply')}
          </Button>
        )}
      </div>

      <div className={grille}>
        <FilterSelect
          label={t('statusLabel')}
          value={valeurs.status || ALL_VALUE}
          onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
          placeholder={t('statusAll')}
          options={[
            { value: ALL_VALUE, label: t('statusAll') },
            ...propertyStatusOptions(tStatus),
          ]}
        />
        <FilterSelect
          label={t('typeLabel')}
          value={valeurs.type || ALL_VALUE}
          onChange={(v) => updateParam('type', v === ALL_VALUE ? null : v)}
          placeholder={t('typeAll')}
          options={[
            { value: ALL_VALUE, label: t('typeAll') },
            ...propertyTypeOptions(tType),
          ]}
        />
        <FilterSelect
          label={t('contractLabel')}
          value={valeurs.contract || ALL_VALUE}
          onChange={(v) => updateParam('contract_type', v === ALL_VALUE ? null : v)}
          placeholder={t('contractAll')}
          options={[
            { value: ALL_VALUE, label: t('contractAll') },
            ...contractTypeOptions(tContract),
          ]}
        />
        <FilterSelect
          label={t('visibilityLabel')}
          value={valeurs.visibility || ALL_VALUE}
          onChange={(v) => updateParam('visibility', v === ALL_VALUE ? null : v)}
          placeholder={t('visibilityAll')}
          options={[
            { value: ALL_VALUE, label: t('visibilityAll') },
            { value: 'public', label: tScope('public') },
            { value: 'private', label: tScope('private') },
          ]}
        />
      </div>

      <div className={grille}>
        <div className={pleineLargeur}>
          <FilterSelect
            label={t('agentLabel')}
            value={valeurs.agent || ALL_VALUE}
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
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('createdFrom')}
          </label>
          <DatePicker
            aria-label={t('createdFrom')}
            value={valeurs.createdFrom}
            onValueChange={(value) => updateParam('created_from', value || null)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('createdTo')}
          </label>
          <DatePicker
            aria-label={t('createdTo')}
            value={valeurs.createdTo}
            onValueChange={(value) => updateParam('created_to', value || null)}
          />
        </div>
      </div>
    </>
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
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <Select
        value={value}
        onValueChange={(v) => onChange((v ?? '') as string)}
        items={options}
      >
        <SelectTrigger className="w-full" aria-label={label}>
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
 * `puceDeChaqueFiltreActif` (`src/types/search.ts`), elle reçoit les traducteurs déjà bornés à
 * leur espace de noms et les applique elle-même. *(Ce docblock citait
 * `SearchToolbar.fabriqueEtiquettes` (TCK-292) ; TCK-340 l'a fondue dans la table
 * `SEARCH_FILTER_KEYS`, et le renvoi pointait vers un symbole disparu.)* Ce n'est pas un contournement : c'est la forme que
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
