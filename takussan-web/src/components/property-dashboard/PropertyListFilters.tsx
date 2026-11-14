'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
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
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  PASTILLES_GESTION,
  pastilleGestionActive,
  pastilleGestionProposee,
  requeteDeLaPastille,
} from '@/lib/biens/mode-de-liste';
import type { ResumeDuPortefeuille } from '@/types/property';
import {
  contractTypeValues,
  propertyStatusFilterValues,
  propertyTypeValues,
} from '@/lib/enums/property';
import {
  PROPERTY_ENUM_NAMESPACES,
  contractTypeOptions,
  enumLabel,
  propertyStatusFilterOptions,
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
 * actifs.
 *
 * TCK-2638 (lot B2) — au bureau, la maquette `app-biens` : en Gestion, un panneau de filtres à gauche
 * (ouvert dès `w1440`, replié en bouton dessous) et une carte qui porte la barre (recherche, tri,
 * « N biens »), la table et la pagination ; en Annonces, une rangée (recherche, type, visibilité,
 * agent, tri), le reste dans le même panneau, replié. **Les commandes de la feuille appellent les MÊMES `updateParam(s)` que la barre
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

/** TCK-2638 — « Retards d'abord » (`sort=retard`, TCK-2637) : le tri du mode Gestion, en tête. */
const SORT_OPTIONS_GESTION = [{ value: 'retard', labelKey: 'retard' }, ...SORT_OPTIONS] as const;

/**
 * TCK-2638 (lot B2, vérification adverse) — pendant une recherche sans `sort=`, l'API classe par
 * pertinence (TCK-662, `defaultSortsWithRelevance`) : le sélecteur le dit, au lieu d'afficher un tri
 * qui ne s'applique pas. Cette valeur ne part JAMAIS au serveur : la choisir efface `sort=`.
 */
const TRI_PERTINENCE = 'pertinence';

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

/** TCK-2638 (lot B2) — `lg` : le bouton « Filtres » déplie le panneau au bureau, ouvre la feuille au téléphone. */
const REQUETE_BUREAU = '(min-width: 64rem)';

/** Ce que « Réinitialiser » du panneau n'efface pas : la vue (le mode), et ce qui n'est pas un filtre. */
const HORS_FILTRES: ReadonlySet<string> = new Set(['mode', 'page', 'per_page', 'voir']);

/**
 * L'état du panneau du bureau (TCK-2638, lot B2, décision 1 a) : `auto` — ouvert dès `w1440`, replié en
 * bouton dessous (maquette « bureau 1280 ») ; `ouvert` — déplié en place à toute largeur `lg`, la table
 * défile alors dans sa carte ; `replie` — fermé à toute largeur. Le mode Annonces part replié : sa barre
 * porte déjà type, visibilité, agent et tri.
 */
type EtatDuPanneau = 'auto' | 'ouvert' | 'replie';

export function PropertyListFilters({
  currentUserId,
  agentOptions = [],
  mode = 'annonces',
  basculeMesBiens = true,
  resume,
  total,
  sousLaBarre,
  pied,
  children,
}: {
  readonly currentUserId: number;
  readonly agentOptions?: readonly { id: number; name: string }[];
  /** TCK-2638 — le mode de la liste : il ajoute « Retards d'abord » et survit à « Tout réinitialiser ». */
  readonly mode?: 'gestion' | 'annonces';
  /** TCK-2638 — « Mes biens » n'est pas proposée au bailleur : sa liste n'a que ses biens. */
  readonly basculeMesBiens?: boolean;
  /** TCK-2638 (lot B2) — les comptes de l'occupation du panneau (Gestion), ceux des tuiles. */
  readonly resume?: ResumeDuPortefeuille;
  /** TCK-2638 (lot B2) — « N biens » au bout de la barre de la table (Gestion, bureau) : le `meta.total`. */
  readonly total?: number;
  /** Sous la barre, avant la liste : les pastilles du téléphone. */
  readonly sousLaBarre?: ReactNode;
  /** Après la liste : la pagination — au bureau, le pied de la carte de la table (Gestion). */
  readonly pied?: ReactNode;
  /** La liste. */
  readonly children?: ReactNode;
}) {
  const t = useTranslations('propertyDashboard.filters');
  const tChips = useTranslations('propertyDashboard.filters.chips');
  const tList = useTranslations('propertyDashboard.list');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const tContract = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const tScope = useTranslations(PROPERTY_ENUM_NAMESPACES.visibilityScope);
  const router = useRouter();
  const searchParams = useSearchParams();
  const gestion = mode === 'gestion';
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
  // TCK-2638 (lot B2) — « Retards d'abord » est le tri par défaut de la Gestion (maquette retenue) ; le
  // serveur le pose (`page.tsx`), l'URL reste nue tant qu'on garde le défaut. Pendant une recherche,
  // l'ordre appliqué sans `sort=` est la pertinence, dans les deux modes : c'est lui que le sélecteur
  // affiche, et tout autre tri — « Retards d'abord » compris — s'écrit alors dans l'URL.
  const enRecherche = currentSearch !== '';
  const triImplicite = enRecherche ? TRI_PERTINENCE : gestion ? 'retard' : '-created_at';
  const currentSort = searchParams.get('sort') ?? triImplicite;
  const includeArchived = searchParams.get('include_archived') === '1';
  const onlyMine = searchParams.get('only_mine') === '1';

  const sortOptions = [
    ...(enRecherche ? [{ value: TRI_PERTINENCE, labelKey: 'pertinence' }] : []),
    ...(gestion ? SORT_OPTIONS_GESTION : SORT_OPTIONS),
  ].map((opt) => ({
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [panneau, setPanneau] = useState<EtatDuPanneau>(gestion ? 'auto' : 'replie');

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

  /** Le tri : le défaut du mode n'écrit rien dans l'URL (TCK-2638, lot B2). */
  const choisirTri = (value: string) => updateParam('sort', value === triImplicite ? null : value);

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

  // TCK-2638 — le mode est une vue, pas un filtre : « Tout réinitialiser » le garde.
  const modeDeLUrl = searchParams.get('mode');
  const resetAll = useCallback(() => {
    router.replace(modeDeLUrl ? `?mode=${encodeURIComponent(modeDeLUrl)}` : '?');
  }, [router, modeDeLUrl]);

  /**
   * UN bouton « Filtres » (TCK-644, TCK-2638 lot B2) : au téléphone il ouvre la feuille, au bureau il
   * déplie le panneau en place. Une seule commande dans le DOM, pas deux homonymes.
   */
  const ouvrirLesFiltres = () => {
    if (typeof window !== 'undefined' && window.matchMedia(REQUETE_BUREAU).matches) setPanneau('ouvert');
    else setSheetOpen(true);
  };

  const criteresProps: CriteresAvancesProps = {
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
  const champs = champsDesCriteres(criteresProps);
  const champsCompacts = champsDesCriteres({ ...criteresProps, compacts: true });

  const aReinitialiser = [...searchParams.keys()].some((cle) => !HORS_FILTRES.has(cle));

  return (
    // TCK-2638 (lot B2) — au bureau, le panneau à gauche et la liste à droite ; en Gestion, la liste est
    // UNE carte : la barre (recherche, tri, « N biens »), les puces, la table, la pagination en pied.
    <div className="lg:flex lg:items-start lg:gap-5">
      {panneau !== 'replie' ? (
        <PanneauDesFiltres
          ouvert={panneau === 'ouvert'}
          onReplier={() => setPanneau('replie')}
          onReinitialiser={aReinitialiser ? resetAll : undefined}
          onSubmit={onAdvancedSubmit}
        >
          {gestion && resume ? (
            <GroupeDuPanneau titre={t('panneau.occupation')}>
              <OccupationDuPanneau resume={resume} />
            </GroupeDuPanneau>
          ) : null}
          <GroupeDuPanneau titre={t(gestion ? 'panneau.typeEtLieu' : 'panneau.lieu')}>
            {gestion ? champs.type : null}
            {champs.city}
          </GroupeDuPanneau>
          <GroupeDuPanneau titre={t(gestion ? 'panneau.agentEtPortee' : 'panneau.afficher')}>
            {gestion ? champs.agent : null}
            {basculeMesBiens ? <LigneInterrupteur label={t('toggleMine')} checked={onlyMine} onChange={toggleMine} /> : null}
            <LigneInterrupteur label={t('toggleArchived')} checked={includeArchived} onChange={toggleArchived} />
          </GroupeDuPanneau>
          <GroupeDuPanneau titre={t('panneau.plus')}>
            <div className="grid grid-cols-2 gap-2">
              {champs.priceMin}
              {champs.priceMax}
            </div>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              {t('apply')}
            </Button>
            {champs.status}
            {champs.contract}
            {gestion ? champs.visibility : null}
            {champs.createdFrom}
            {champs.createdTo}
          </GroupeDuPanneau>
        </PanneauDesFiltres>
      ) : null}

      <div
        className={cn(
          'min-w-0 lg:flex-1',
          gestion ? 'lg:rounded-xl lg:border lg:border-border lg:bg-card' : 'space-y-3 lg:space-y-6',
        )}
      >
        {/* TCK-644 — sous `lg`, plus de carte : la recherche se pose seule sur le fond de page, à côté
            d'UN bouton « Filtres » qui ouvre la feuille du bas. Dès `lg`, la barre de la maquette. */}
        <div className={cn('space-y-3 px-4 md:px-0', gestion ? 'lg:space-y-0' : 'lg:space-y-3')}>
          <div
            className={cn(
              'flex items-center gap-2 lg:gap-3',
              gestion ? 'lg:border-b lg:border-border lg:px-4 lg:py-3' : 'lg:flex-wrap xl:flex-nowrap',
            )}
          >
            <form
              onSubmit={onSearchSubmit}
              className="relative min-w-0 flex-1 lg:w-[calc(var(--spacing)*83.33)] lg:flex-none"
            >
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
                className={cn(
                  'rounded-xl bg-card pl-9 shadow-xs lg:rounded-lg lg:shadow-none',
                  gestion && 'lg:bg-transparent',
                )}
                defaultValue={currentSearch}
                key={currentSearch}
              />
            </form>

            {/* Le nom accessible CONTIENT le libellé visible (WCAG 2.5.3) et dit combien de filtres sont
                posés. Au bureau, il n'est là que si le panneau est replié (sous `w1440` par défaut). */}
            <Button
              type="button"
              variant="outline"
              aria-label={t('mobile.buttonAria', { count: filtresActifs })}
              aria-haspopup="dialog"
              onClick={ouvrirLesFiltres}
              className={cn(
                'h-11 shrink-0 gap-2 rounded-xl bg-card px-3.5 shadow-xs lg:order-first lg:h-9 lg:rounded-lg lg:px-3 lg:shadow-none',
                filtresActifs > 0 && 'border-primary/40 text-primary',
                panneau === 'ouvert' && 'lg:hidden',
                panneau === 'auto' && 'w1440:hidden',
              )}
            >
              <SlidersHorizontal aria-hidden="true" className="size-4 lg:hidden" />
              <PanelLeftOpen aria-hidden="true" strokeWidth={1.5} className="hidden size-4 text-muted-foreground lg:block" />
              <span>{t('mobile.button')}</span>
              {filtresActifs > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
                  {filtresActifs}
                </span>
              ) : null}
            </Button>

            <div data-testid="filtres-ordinateur" className="hidden lg:contents">
              {gestion ? null : (
                <>
                  {champsCompacts.type}
                  {champsCompacts.visibility}
                  {champsCompacts.agent}
                </>
              )}
              <div className={cn('flex-none', gestion ? 'min-w-[calc(var(--spacing)*50)]' : 'ml-auto min-w-[calc(var(--spacing)*50)]')}>
                <Select
                  value={currentSort}
                  onValueChange={(v) => choisirTri((v ?? triImplicite) as string)}
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
              {gestion && total !== undefined ? (
                <span data-testid="total-de-la-liste" className="ml-auto text-ui whitespace-nowrap text-muted-foreground tabular-nums">
                  {t('total', { count: total })}
                </span>
              ) : null}
            </div>
          </div>

          {/* Active filter chips — une rangée qui défile de bord à bord sous `lg` (elle sort de la
              marge de la coque, `-mx-4`/`md:-mx-6`), qui passe à la ligne dès `lg`. */}
          {activeFilters.length > 0 ? (
            <div
              className={cn(
                '-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden',
                gestion && 'lg:border-b lg:border-border lg:px-4 lg:py-2.5',
              )}
            >
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
        </div>

        {sousLaBarre}
        {children}
        {pied ? <div className={cn(gestion && 'max-lg:mt-3')}>{pied}</div> : null}
      </div>

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
              <SheetDescription className="mt-0.5">{t('mobile.consigne')}</SheetDescription>
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
                        onChange={() => choisirTri(opt.value)}
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
                  {basculeMesBiens ? <LigneACocher label={t('toggleMine')} checked={onlyMine} onChange={toggleMine} /> : null}
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
                <CriteresDeLaFeuille champs={champs} />
              </fieldset>
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 pt-3 pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))]">
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

/**
 * TCK-2638 (lot B2) — le panneau de filtres du bureau (maquette `app-biens`, bureau Gestion) : tout ce que
 * la liste sait filtrer, en groupes, sur 204 px de la maquette (`calc(var(--spacing)*56.67)`). Il appelle
 * les MÊMES `updateParam(s)` que la feuille du téléphone (TCK-644) : un filtre déplacé produit la même
 * requête. Ouvert dès `w1440` par défaut ; dessous, il se déplie en place depuis « Filtres ».
 */
function PanneauDesFiltres({
  ouvert,
  onReplier,
  onReinitialiser,
  onSubmit,
  children,
}: {
  readonly ouvert: boolean;
  readonly onReplier: () => void;
  readonly onReinitialiser?: () => void;
  readonly onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  readonly children: ReactNode;
}) {
  const t = useTranslations('propertyDashboard.filters.panneau');
  return (
    <aside
      aria-label={t('aria')}
      data-testid="panneau-de-filtres"
      className={cn(
        'hidden w-[calc(var(--spacing)*56.67)] flex-none self-start rounded-xl border border-border bg-card',
        ouvert ? 'lg:block' : 'w1440:block',
      )}
    >
      <div className="flex h-11 items-center gap-1 pr-1 pl-4">
        <p className="flex-1 text-sm font-semibold">{t('titre')}</p>
        {onReinitialiser ? (
          <button
            type="button"
            onClick={onReinitialiser}
            className="rounded-sm px-1 text-ui text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('reinitialiser')}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t('replier')}
          onClick={onReplier}
          className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          <PanelLeftClose aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </button>
      </div>
      <form data-testid="filtres-avances-ordinateur" onSubmit={onSubmit}>
        {children}
      </form>
    </aside>
  );
}

function GroupeDuPanneau({ titre, children }: { readonly titre: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="border-t border-border px-4 py-3">
      <p id={id} className="mb-2 text-ui font-semibold">
        {titre}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * L'occupation du panneau : les pastilles du téléphone et les tuiles du bureau, en boutons radio — même
 * requête (`requeteDeLaPastille`), mêmes comptes (`portfolio-summary`), « À vendre » aux mêmes conditions.
 */
function OccupationDuPanneau({ resume }: { readonly resume: ResumeDuPortefeuille }) {
  const t = useTranslations('propertyDashboard.gestion.pastilles');
  const fmt = useFormatteurs();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const active = pastilleGestionActive(params);
  return (
    <>
      {PASTILLES_GESTION.filter((p) => pastilleGestionProposee(p.cle, resume.for_sale, active)).map((p) => (
        <label
          key={p.cle}
          className="flex min-h-7 cursor-pointer items-center gap-2 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring"
        >
          <input
            type="radio"
            name="occupation-du-panneau"
            checked={p.cle === active}
            onChange={() => router.replace(`?${requeteDeLaPastille(params, p.cle)}`)}
            className="size-4 shrink-0 cursor-pointer accent-primary"
          />
          <span className={cn('min-w-0 flex-1 truncate', p.cle === active && 'font-medium')}>{t(p.cle)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{fmt.nombre(resume[p.compte])}</span>
        </label>
      ))}
    </>
  );
}

/** L'interrupteur du panneau : la ligne entière est la cible (un `<label>` l'enveloppe). */
function LigneInterrupteur({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">{label}</span>
      <Switch checked={checked} onCheckedChange={(valeur) => onChange(valeur)} />
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
  readonly t: ReturnType<typeof useTranslations<'propertyDashboard.filters'>>;
  readonly tList: ReturnType<typeof useTranslations<'propertyDashboard.list'>>;
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
  /** Les listes de la barre du bureau (mode Annonces) : sans libellé au-dessus, à largeur fixe. */
  readonly compacts?: boolean;
}

type NomDeChamp =
  | 'city'
  | 'priceMin'
  | 'priceMax'
  | 'status'
  | 'type'
  | 'contract'
  | 'visibility'
  | 'agent'
  | 'createdFrom'
  | 'createdTo';

/**
 * Les critères, UNE fois pour tous les emplacements (TCK-644, TCK-2638 lot B2) : la feuille du bas, le
 * panneau du bureau et la barre des Annonces ne diffèrent que par la disposition. Deux copies auraient
 * fini par ne plus envoyer la même requête.
 */
function champsDesCriteres({
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
  compacts = false,
}: CriteresAvancesProps): Readonly<Record<NomDeChamp, ReactNode>> {
  const largeur = compacts ? 'w-[calc(var(--spacing)*44.44)] flex-none' : undefined;
  return {
    city: (
      <Input
        aria-label={t('cityAria')}
        name="city"
        placeholder={t('cityPlaceholder')}
        defaultValue={valeurs.city}
        key={`city-${valeurs.city}`}
      />
    ),
    priceMin: (
      <Input
        aria-label={t('priceMinAria')}
        name="price_min"
        inputMode="numeric"
        placeholder={t('priceMinPlaceholder')}
        defaultValue={valeurs.priceMin}
        key={`pmin-${valeurs.priceMin}`}
      />
    ),
    priceMax: (
      <Input
        aria-label={t('priceMaxAria')}
        name="price_max"
        inputMode="numeric"
        placeholder={t('priceMaxPlaceholder')}
        defaultValue={valeurs.priceMax}
        key={`pmax-${valeurs.priceMax}`}
      />
    ),
    status: (
      <FilterSelect
        label={t('statusLabel')}
        value={valeurs.status || ALL_VALUE}
        onChange={(v) => updateParam('status', v === ALL_VALUE ? null : v)}
        placeholder={t('statusAll')}
        options={[
          { value: ALL_VALUE, label: t('statusAll') },
          ...propertyStatusFilterOptions(tStatus),
        ]}
      />
    ),
    type: (
      <FilterSelect
        label={t('typeLabel')}
        libelleMasque={compacts}
        className={largeur}
        value={valeurs.type || ALL_VALUE}
        onChange={(v) => updateParam('type', v === ALL_VALUE ? null : v)}
        placeholder={t('typeAll')}
        options={[
          { value: ALL_VALUE, label: t('typeAll') },
          ...propertyTypeOptions(tType),
        ]}
      />
    ),
    contract: (
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
    ),
    visibility: (
      <FilterSelect
        label={t('visibilityLabel')}
        libelleMasque={compacts}
        className={largeur}
        value={valeurs.visibility || ALL_VALUE}
        onChange={(v) => updateParam('visibility', v === ALL_VALUE ? null : v)}
        placeholder={t('visibilityAll')}
        options={[
          { value: ALL_VALUE, label: t('visibilityAll') },
          { value: 'public', label: tScope('public') },
          { value: 'private', label: tScope('private') },
        ]}
      />
    ),
    agent: (
      <FilterSelect
        label={t('agentLabel')}
        libelleMasque={compacts}
        className={largeur}
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
    ),
    createdFrom: (
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
    ),
    createdTo: (
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
    ),
  };
}

/** La feuille du bas : une colonne au pouce, en deux colonnes de 2 ; son pied valide (pas d'« Appliquer »). */
function CriteresDeLaFeuille({ champs }: { readonly champs: Readonly<Record<NomDeChamp, ReactNode>> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">{champs.city}</div>
        {champs.priceMin}
        {champs.priceMax}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {champs.status}
        {champs.type}
        {champs.contract}
        {champs.visibility}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">{champs.agent}</div>
        {champs.createdFrom}
        {champs.createdTo}
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
  libelleMasque = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  /** TCK-2638 (lot B2) — la barre des Annonces : le déclencheur porte déjà le nom (`aria-label`). */
  libelleMasque?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {libelleMasque ? null : <label className="mb-1 block text-xs text-muted-foreground">{label}</label>}
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
    chips.push({ key: 'status', label: ctx.tChips('status'), value: enumLabel(ctx.tStatus, propertyStatusFilterValues, status) });
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
