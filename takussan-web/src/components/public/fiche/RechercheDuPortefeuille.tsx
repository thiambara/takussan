'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/components/feedback';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { PucesDeFiltres } from '@/components/search/SearchToolbar';
import { PropertyCard } from '@/components/property/PropertyCard';
import { LigneDeResultat } from '@/components/property/liste/LigneDeResultat';
import { VoirPlus } from '@/components/property/liste/VoirPlus';
import { useSuiteDeLaListe } from '@/components/property/liste/suite';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { filtersToParams, useSearch, type GraineDeRecherche } from '@/hooks/useSearch';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { requeteAvecFixes } from '@/lib/recherche-publique';
import { compteDe, compteDesChambres, elargissementsDeFiche } from '@/lib/fiche-publique';
import type { SearchFilters, SearchResult } from '@/types/search';

const TRIS = ['relevance', 'created_desc', 'price_asc', 'price_desc'] as const;
const CHAMBRES = [1, 2, 3, 4] as const;
/** Les premières cartes dont l'image est préchargée. */
const PRIORITAIRES = 3;

export interface RechercheDuPortefeuilleProps {
  /** Ce que le rendu serveur a obtenu pour l'URL courante (`chargerPortefeuilleDeFiche`). */
  readonly graine: GraineDeRecherche | null;
  /** Le périmètre et les paramètres fixes (`parametresFixesDeFiche`). */
  readonly fixes: Readonly<Record<string, string>>;
  /** Le « sur M » : tout le portefeuille cherchable, ou `null` s'il n'est pas sûr. */
  readonly total: number | null;
  /** Le nom de l'agence ou de la personne, pour l'état « aucun bien ». */
  readonly nom: string;
  /** TCK-2523 — l'agence d'un agent : l'état « aucun bien » renvoie vers ses biens. */
  readonly agence?: { readonly nom: string; readonly slug: string } | null;
  /** Le titre de la section, rendu en tête (`<h2>`), et son identifiant. */
  readonly titre?: ReactNode;
  /**
   * Où la recherche colle au téléphone (maquette D) : sous les onglets de la fiche d'agence
   * (`onglets`, 49 px) ou sous la rangée « ← · partager » de la fiche de personne (`en-tete`, 56 px).
   * En bureau, elle reste dans le flux.
   */
  readonly collerSous?: 'onglets' | 'en-tete';
}

/** La hauteur de ce qui colle au-dessus de la recherche, au téléphone. */
const HAUT_COLLANT = { onglets: 'top-[49px]', 'en-tete': 'top-14' } as const;

/**
 * TCK-2522 / TCK-2523 — la recherche dans les biens d'une fiche (agence, ou agent au-delà de six
 * biens) : un champ, Tous / À louer / À vendre avec leurs comptes, Type · Budget · Chambres ·
 * Quartier, le tri, les filtres posés en puces retirables, « N biens sur M », et l'état « aucun
 * bien » qui propose d'élargir.
 *
 * **Les filtres sont ceux de la liste, sur le même composant** : `useSearch` (URL, historique,
 * puces en attente) et `FilterSidebar` (la feuille, ici sans rail). La fiche n'ajoute que son
 * périmètre, par `parametresFixes` — jamais écrit dans l'URL, qui ne porte que les filtres du
 * visiteur : un lien partagé rouvre la même sélection, et se transpose tel quel vers `/properties`.
 *
 * Les comptes par option sont les FACETTES de l'API (TCK-2517), calculées sous tous les filtres
 * sauf le leur. Au téléphone, une pastille de filtre ouvre la feuille ; en bureau, un panneau par
 * filtre, avec le compte de chaque option.
 */
export function RechercheDuPortefeuille({ graine, fixes, total, nom, agence = null, titre, collerSous = 'onglets' }: RechercheDuPortefeuilleProps) {
  const t = useTranslations('publicProfile.recherche');
  const tPortfolio = useTranslations('publicProfile.portfolio.tabs');
  const tToolbar = useTranslations('search.toolbar');
  const tSort = useTranslations('search.sort');
  const pathname = usePathname();
  const bureau = useMatchesMedia('(min-width: 1024px)');
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);

  const {
    data,
    loading,
    enCours,
    error,
    filters,
    filtresDesResultats,
    activeCount,
    search,
    resetFilters,
    removeFilter,
    cleDesResultats,
  } = useSearch({ graine, parametresFixes: fixes, sansPageUne: true });
  const suite = useSuiteDeLaListe(error ? null : data, cleDesResultats, fixes);

  const meta = data?.meta;
  const facettes = meta?.facets;
  const pages = data ? [data, ...suite.pages] : [];
  const biens = pages.flatMap((page) => page.data);
  const affiches = meta ? (meta.current_page - 1) * meta.per_page + biens.length : 0;
  const filtre = activeCount > 0 || Boolean(filters.q);
  const aucun = !loading && !error && meta?.total === 0;

  const changer = (patch: Partial<SearchFilters>, options?: { continu?: boolean }) =>
    search({ ...filters, ...patch }, { historique: options?.continu ? 'replace' : 'push' });

  const retirer = (cle: keyof SearchFilters, sousCle?: string) => {
    if ((cle === 'type' || cle === 'condition' || cle === 'cities') && sousCle) {
      const reste = ((filters[cle] as string[] | undefined) ?? []).filter((v) => v !== sousCle);
      changer({ [cle]: reste.length > 0 ? reste : undefined } as Partial<SearchFilters>);
    } else {
      removeFilter(cle);
    }
  };

  const hrefSuivante = (() => {
    if (suite.pageSuivante === null) return null;
    const params = filtersToParams({ ...filters, page: suite.pageSuivante });
    return `${pathname}?${params.toString()}`;
  })();

  // Tous / À louer / À vendre — la facette `contract_type` est calculée SANS le filtre de
  // transaction : ses trois comptes restent justes quelle que soit la transaction choisie.
  const louer = compteDe(facettes?.contract_type, 'rent');
  const vendre = compteDe(facettes?.contract_type, 'sale');
  const facetteTransaction = facettes?.contract_type !== undefined;

  return (
    <div data-recherche-portefeuille className="space-y-3">
      {titre}

      {/* Revue du 2026-11-09 — champ, pastilles et puces COLLENT ensemble au téléphone (maquette D :
          `sticky top-[49px]` sous les onglets, `TeteFiltree` / `TeteFiltreeAgent`). Le fond bord à
          bord masque les lignes qui passent dessous ; en bureau, le bloc reste dans le flux. */}
      <div
        data-recherche-collante
        className={cn(
          'sticky z-20 -mx-4 space-y-3 bg-background px-4 pb-2 pt-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0',
          HAUT_COLLANT[collerSous],
        )}
      >
        <form
          role="search"
          aria-label={t('champAria', { nom })}
          className="flex items-center gap-2"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const valeur = String(new FormData(e.currentTarget).get('q') ?? '').trim();
            changer({ q: valeur === '' ? undefined : valeur });
          }}
        >
          <ChampDeRecherche
            key={filters.q ?? ''}
            valeur={filters.q ?? ''}
            placeholder={total !== null ? t('champ', { count: total }) : t('champSansTotal')}
            libelleVider={t('viderChamp')}
            onVider={() => changer({ q: undefined })}
          />
          <button
            type="button"
            onClick={() => setFeuilleOuverte(true)}
            aria-label={activeCount > 0 ? t('filtresActifs', { count: activeCount }) : tToolbar('filters')}
            className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-[border-color,scale] hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {activeCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </button>
        </form>

        {/* Les filtres rapides : une rangée qui défile au téléphone, sur une ligne en bureau. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
          <Pastille actif={!filters.contract_type} onClick={() => changer({ contract_type: undefined, rent_period: undefined })}>
            {tPortfolio('all')}
            {facetteTransaction ? <Compte n={louer + vendre} /> : null}
          </Pastille>
          <Pastille actif={filters.contract_type === 'rent'} onClick={() => changer({ contract_type: 'rent' })}>
            {tPortfolio('rent')}
            {facetteTransaction ? <Compte n={louer} /> : null}
          </Pastille>
          {!facetteTransaction || vendre > 0 || filters.contract_type === 'sale' ? (
            <Pastille actif={filters.contract_type === 'sale'} onClick={() => changer({ contract_type: 'sale', rent_period: undefined })}>
              {tPortfolio('sale')}
              {facetteTransaction ? <Compte n={vendre} /> : null}
            </Pastille>
          ) : null}
          <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 self-center bg-border" />
          {bureau ? (
            <PanneauxDeFiltre filters={filters} facettes={facettes} changer={changer} />
          ) : (
            (['type', 'budget', 'chambres', 'quartier'] as const).map((cle) => (
              <Pastille key={cle} onClick={() => setFeuilleOuverte(true)} actif={estPose(cle, filters)}>
                {t(`pastilles.${cle}`)}
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </Pastille>
            ))
          )}
      </div>

      {filtre ? (
        <PucesDeFiltres
          filters={filters}
          filtresDesResultats={filtresDesResultats}
          onRemoveFilter={retirer}
          aria-label={t('pucesAria')}
        />
      ) : null}
      </div>

      <div className="flex min-h-9 items-center justify-between gap-3 text-sm text-muted-foreground">
        <p aria-live="polite" className={cn(aucun && 'sr-only')}>
          {meta && !error ? (
            <>
              <span className="font-semibold tabular-nums text-foreground">{t('compte', { count: meta.total })}</span>
              {filtre && total !== null ? <span className="tabular-nums"> {t('surTotal', { total })}</span> : null}
              {filtre ? (
                <>
                  {' · '}
                  <button type="button" onClick={resetFilters} className="font-medium text-foreground underline underline-offset-4">
                    {t('effacer')}
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </p>
        <Select value={filters.sort ?? 'relevance'} onValueChange={(v) => changer({ sort: v as SearchFilters['sort'] })} items={TRIS.map((v) => ({ value: v, label: tSort(v) }))}>
          <SelectTrigger aria-label={tToolbar('sortAria')} className="w-fit shrink-0 rounded-full border-border bg-card px-3 text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIS.map((v) => (
              <SelectItem key={v} value={v}>
                {tSort(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && biens.length === 0 ? (
        <ErrorState message={t('erreur')} />
      ) : aucun ? (
        <AucunBien
          nom={nom}
          filters={filters}
          facettes={facettes}
          agence={agence}
          onEffacer={resetFilters}
          onElargir={(cle) => changer(cle === 'contract_type' ? { contract_type: undefined, rent_period: undefined } : { type: undefined })}
        />
      ) : (
        <div className={cn('transition-opacity', enCours && 'opacity-60')} aria-busy={enCours || undefined}>
          <ul className="divide-y divide-border md:grid md:grid-cols-2 md:gap-x-5 md:gap-y-7 md:divide-y-0 xl:grid-cols-3">
            {biens.map((bien, i) => (
              <li key={bien.id}>
                <LigneDeResultat property={bien} priority={i < PRIORITAIRES} className="md:hidden" />
                <PropertyCard
                  property={bien}
                  index={i}
                  priority={i < PRIORITAIRES}
                  revelee={i < 6}
                  sizes="(max-width: 767px) 1px, (max-width: 1279px) 34vw, 22vw"
                  transactionFiltree={filters.contract_type}
                  className="max-md:hidden"
                />
              </li>
            ))}
          </ul>
          {meta ? (
            <VoirPlus
              total={meta.total}
              affiches={affiches}
              parPage={meta.per_page}
              href={hrefSuivante}
              chargement={suite.chargement}
              erreur={suite.erreur}
              onVoirPlus={suite.voirPlus}
              className="pt-6"
            />
          ) : null}
        </div>
      )}

      <FilterSidebar
        sansRail
        filters={filters}
        onFilterChange={changer}
        onReset={resetFilters}
        activeCount={activeCount}
        filtresDesResultats={filtresDesResultats}
        enCours={enCours}
        open={feuilleOuverte}
        onClose={() => setFeuilleOuverte(false)}
        total={enCours || error ? null : (meta?.total ?? 0)}
      />
    </div>
  );
}

function estPose(cle: 'type' | 'budget' | 'chambres' | 'quartier', filters: SearchFilters): boolean {
  switch (cle) {
    case 'type':
      return (filters.type?.length ?? 0) > 0;
    case 'budget':
      return filters.price_min !== undefined || filters.price_max !== undefined;
    case 'chambres':
      return filters.bedrooms !== undefined;
    case 'quartier':
      return Boolean(filters.location);
  }
}

/** Le champ, non contrôlé : sa valeur part à la validation, et se relit de l'URL (`key`). */
function ChampDeRecherche({
  valeur,
  placeholder,
  libelleVider,
  onVider,
}: {
  readonly valeur: string;
  readonly placeholder: string;
  readonly libelleVider: string;
  readonly onVider: () => void;
}) {
  const id = useId();
  return (
    <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      {/* La primitive, sans sa bordure : la coque en pilule porte le champ (comme la barre de la liste). */}
      <Input
        id={id}
        name="q"
        type="search"
        defaultValue={valeur}
        placeholder={placeholder}
        enterKeyHint="search"
        className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-foreground shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent [&::-webkit-search-cancel-button]:hidden"
      />
      {valeur ? (
        <button type="button" onClick={onVider} aria-label={libelleVider} className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function Compte({ n }: { readonly n: number }) {
  return <span className="font-normal tabular-nums opacity-80">{n}</span>;
}

function Pastille({
  actif = false,
  onClick,
  children,
}: {
  readonly actif?: boolean;
  readonly onClick?: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,scale] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        actif ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:border-primary',
      )}
    >
      {children}
    </button>
  );
}

/**
 * En bureau : un panneau par filtre, avec le compte de chaque option (facettes de l'API). Le
 * budget n'a pas de compte — l'API ne sert pas de facette de prix (`facets=price` → 422).
 */
function PanneauxDeFiltre({
  filters,
  facettes,
  changer,
}: {
  readonly filters: SearchFilters;
  readonly facettes: SearchResult['meta']['facets'];
  readonly changer: (patch: Partial<SearchFilters>) => void;
}) {
  const t = useTranslations('publicProfile.recherche');
  const tTypes = useTranslations('property.types');
  const tChips = useTranslations('search.filters.chips');
  const tFiltres = useTranslations('search.filters');
  const types = (facettes?.type ?? []).filter((option) => option.count > 0 || filters.type?.includes(String(option.value)));
  const quartiers = (facettes?.neighborhood ?? []).filter((option) => option.count > 0 || filters.location === String(option.value));

  return (
    <>
      <Panneau libelle={t('pastilles.type')} actif={estPose('type', filters)}>
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('aucuneOption')}</p>
        ) : (
          <ul className="space-y-0.5">
            {types.map((option) => {
              const valeur = String(option.value);
              const choisi = filters.type?.includes(valeur) ?? false;
              return (
                <li key={valeur}>
                  <OptionDePanneau
                    choisi={choisi}
                    compte={option.count}
                    onClick={() => {
                      const suivants = choisi ? (filters.type ?? []).filter((v) => v !== valeur) : [...(filters.type ?? []), valeur];
                      changer({ type: suivants.length > 0 ? suivants : undefined });
                    }}
                  >
                    {tTypes.has(valeur) ? tTypes(valeur) : valeur}
                  </OptionDePanneau>
                </li>
              );
            })}
          </ul>
        )}
      </Panneau>
      <Panneau libelle={t('pastilles.budget')} actif={estPose('budget', filters)}>
        <PanneauBudget filters={filters} changer={changer} libelleMin={tFiltres('min')} libelleMax={tFiltres('max')} appliquer={t('appliquer')} />
      </Panneau>
      <Panneau libelle={t('pastilles.chambres')} actif={estPose('chambres', filters)}>
        <ul className="space-y-0.5">
          {CHAMBRES.map((n) => {
            const choisi = filters.bedrooms === n;
            return (
              <li key={n}>
                <OptionDePanneau choisi={choisi} compte={compteDesChambres(facettes?.bedrooms, n)} onClick={() => changer({ bedrooms: choisi ? undefined : n })}>
                  {tChips('bedroomsMin', { n })}
                </OptionDePanneau>
              </li>
            );
          })}
        </ul>
      </Panneau>
      <Panneau libelle={t('pastilles.quartier')} actif={estPose('quartier', filters)}>
        {quartiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('aucuneOption')}</p>
        ) : (
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {quartiers.map((option) => {
              const valeur = String(option.value);
              const choisi = filters.location === valeur;
              return (
                <li key={valeur}>
                  <OptionDePanneau choisi={choisi} compte={option.count} onClick={() => changer({ location: choisi ? undefined : valeur })}>
                    {valeur}
                  </OptionDePanneau>
                </li>
              );
            })}
          </ul>
        )}
      </Panneau>
    </>
  );
}

function Panneau({ libelle, actif, children }: { readonly libelle: string; readonly actif: boolean; readonly children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-[border-color,scale] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-popup-open:border-foreground',
          actif ? 'border-foreground bg-secondary text-foreground' : 'border-border bg-card text-foreground hover:border-primary',
        )}
      >
        {libelle}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">{children}</PopoverContent>
    </Popover>
  );
}

function OptionDePanneau({
  choisi,
  compte,
  onClick,
  children,
}: {
  readonly choisi: boolean;
  readonly compte: number;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={choisi}
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-muted',
        choisi ? 'font-semibold text-foreground' : 'text-foreground',
      )}
    >
      <span className="truncate">{children}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{compte}</span>
    </button>
  );
}

function PanneauBudget({
  filters,
  changer,
  libelleMin,
  libelleMax,
  appliquer,
}: {
  readonly filters: SearchFilters;
  readonly changer: (patch: Partial<SearchFilters>) => void;
  readonly libelleMin: string;
  readonly libelleMax: string;
  readonly appliquer: string;
}) {
  const lire = (v: FormDataEntryValue | null): number | undefined => {
    const n = Number(String(v ?? '').replace(/\s/g, ''));
    return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return (
    <form
      className="space-y-3 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        changer({ price_min: lire(donnees.get('price_min')), price_max: lire(donnees.get('price_max')) });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {(['price_min', 'price_max'] as const).map((cle) => (
          <label key={cle} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {cle === 'price_min' ? libelleMin : libelleMax}
            <Input
              name={cle}
              inputMode="numeric"
              defaultValue={filters[cle] ?? ''}
              className="bg-card px-2.5 tabular-nums text-foreground"
            />
          </label>
        ))}
      </div>
      <button type="submit" className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-[var(--primary-deep)]">
        {appliquer}
      </button>
    </form>
  );
}

/**
 * L'état « aucun bien » : dire ce qui manque, effacer en un geste, élargir avec le compte de chaque
 * option (les facettes, cf. `elargissementsDeFiche`), ou chercher ailleurs avec les mêmes critères.
 * Pour un agent, le premier élargissement est son agence, compté par une requête de plus.
 */
function AucunBien({
  nom,
  filters,
  facettes,
  agence,
  onEffacer,
  onElargir,
}: {
  readonly nom: string;
  readonly filters: SearchFilters;
  readonly facettes: SearchResult['meta']['facets'];
  readonly agence: { readonly nom: string; readonly slug: string } | null;
  readonly onEffacer: () => void;
  readonly onElargir: (cle: 'contract_type' | 'type') => void;
}) {
  const t = useTranslations('publicProfile.recherche');
  const criteres = filtersToParams({ ...filters, page: undefined });
  const signature = criteres.toString();
  const compteChezLAgence = useCompteChezLAgence(agence?.slug ?? null, signature);
  const elargissements = elargissementsDeFiche(filters, facettes);
  // Deux élargissements au plus : « chez son agence » prend la première place quand il rend des biens.
  const chezLAgence = agence !== null && compteChezLAgence !== null && compteChezLAgence > 0;

  return (
    <div data-aucun-bien className="max-w-lg py-4">
      <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">{t('aucun.titre')}</h3>
      <p className="mt-1 text-[15px] text-muted-foreground">{t('aucun.texte', { nom })}</p>
      <button
        type="button"
        onClick={onEffacer}
        className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-[background-color,scale] hover:bg-[var(--primary-deep)] active:scale-[0.96]"
      >
        {t('effacer')}
      </button>
      {elargissements.length > 0 || chezLAgence ? (
        <>
          <p className="mt-6 text-[15px] font-semibold text-foreground">{t('aucun.elargir')}</p>
          <ul className="mt-1 divide-y divide-border border-b border-border">
            {agence && chezLAgence ? (
              <li>
                <LienLocalise
                  data-elargir="agence"
                  href={`/agencies/${encodeURIComponent(agence.slug)}${signature ? `?${signature}` : ''}`}
                  className="flex min-h-12 items-center justify-between gap-3 text-[15px] text-foreground hover:text-primary"
                >
                  <span className="truncate">{t('aucun.chezLAgence', { agence: agence.nom })}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{t('compteBiens', { count: compteChezLAgence })}</span>
                </LienLocalise>
              </li>
            ) : null}
            {elargissements.slice(0, chezLAgence ? 1 : 2).map((e) => (
              <li key={e.cle}>
                <button
                  type="button"
                  data-elargir={e.cle}
                  onClick={() => onElargir(e.cle)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-[15px] text-foreground hover:text-primary"
                >
                  <span className="truncate">{t(`aucun.sans.${e.cle}`)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{t('compteBiens', { count: e.compte })}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <LienLocalise
        href={`/properties${signature ? `?${signature}` : ''}`}
        className="mt-4 inline-block text-[15px] font-medium text-foreground underline underline-offset-4 hover:text-primary"
      >
        {t('aucun.ailleurs')}
      </LienLocalise>
    </div>
  );
}

/** Le nombre de biens de l'agence sous les mêmes critères — `null` tant qu'il n'est pas connu. */
function useCompteChezLAgence(slug: string | null, signature: string): number | null {
  const [etat, setEtat] = useState<{ cle: string; compte: number } | null>(null);
  const cle = slug ? `${slug}?${signature}` : null;
  useEffect(() => {
    if (!slug || cle === null) return;
    let annule = false;
    const requete = requeteAvecFixes(new URLSearchParams(signature), { agency: slug, placements: 'false', per_page: '1' });
    apiFetch<SearchResult>(`/public/properties/search?${requete.toString()}`)
      .then((r) => {
        if (!annule) setEtat({ cle, compte: r.meta.total });
      })
      .catch(() => {
        // Une panne n'invente pas de compte : l'élargissement n'est simplement pas proposé.
      });
    return () => {
      annule = true;
    };
  }, [slug, signature, cle]);
  return etat && etat.cle === cle ? etat.compte : null;
}
