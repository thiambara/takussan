'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { List, Map as MapIcon, SearchX } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { SearchToolbar } from '@/components/search/SearchToolbar';
import { WidenedSearchNotice } from '@/components/search/WidenedSearchNotice';
import { Pagination } from '@/components/search/Pagination';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PropertyMap } from '@/components/map';
import { SaveSearchButton } from '@/components/favorites/SaveSearchButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearch } from '@/hooks/useSearch';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { CLES_DE_RECHERCHE, type SearchFilters } from '@/types/search';

/**
 * Canonical `/properties` discovery layout — Wave 3.
 *
 * Wraps the existing filter sidebar + toolbar + pagination (reused from
 * Wave 2) with the Wave 3 additions :
 *   - view toggle (list / map)
 *   - `SaveSearchButton` (requires auth)
 *   - canonical {@link PropertyCard} (owns favorites button)
 *
 * The underlying `useSearch` hook (reducer + URL sync) is untouched; it
 * already satisfies TCK-039 URL-sync AC.
 */

type View = 'list' | 'map';

/**
 * Les clés que l'utilisateur peut retirer depuis cet écran. Sert uniquement à décider si un 422
 * désigne un filtre RÉPARABLE.
 *
 * TCK-346 — **dérivée de `SEARCH_FILTER_KEYS`**, alors qu'elle était écrite à la main. Elle
 * citait dix-huit clés et venait donc d'en manquer trois (`lat`, `lng`, `radius_km`) : un 422
 * sur `radius_km` — que le plafond de 500 km rend parfaitement atteignable depuis un lien —
 * n'aurait proposé que « effacer toute la recherche ». Son propre commentaire disait déjà que
 * la liste faisant autorité vit ailleurs ; elle la recopiait quand même.
 *
 * `removeFilter` remonte à l'agrégateur (TCK-346), donc chaque clé listée ici est réellement
 * retirable, y compris `lat` et `lng` qui n'ont pas de puce propre.
 */
const FILTRES_CONNUS = new Set<keyof SearchFilters>(CLES_DE_RECHERCHE);

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-4/3 w-full rounded-xl" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function SearchEmpty({ onReset }: { onReset: () => void }) {
  const t = useTranslations('search.results');
  return (
    // `col-span-full` : ce bloc vit DANS la grille de résultats. C'est la raison pour laquelle
    // `EmptyState` spread ses props résiduelles et accepte `className`.
    <EmptyState
      className="col-span-full"
      icon={<SearchX className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
      action={
        <Button type="button" variant="outline" onClick={onReset}>
          {t('empty_cta')}
        </Button>
      }
    />
  );
}

function ViewToggle({
  view,
  onChange,
  className = '',
}: {
  view: View;
  onChange: (v: View) => void;
  className?: string;
}) {
  const t = useTranslations('property.discovery');

  return (
    <div
      role="tablist"
      aria-label={t('viewSwitchAria')}
      className={`inline-flex items-center rounded-full border border-stone-200 bg-white p-1 shadow-sm ${className}`}
    >
      <button
        role="tab"
        aria-selected={view === 'list'}
        onClick={() => onChange('list')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
          view === 'list'
            ? 'bg-primary text-white'
            : 'text-stone-600 hover:text-primary'
        }`}
      >
        <List className="w-3.5 h-3.5" />
        {t('viewList')}
      </button>
      <button
        role="tab"
        aria-selected={view === 'map'}
        onClick={() => onChange('map')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
          view === 'map'
            ? 'bg-primary text-white'
            : 'text-stone-600 hover:text-primary'
        }`}
      >
        <MapIcon className="w-3.5 h-3.5" />
        {t('viewMap')}
      </button>
    </div>
  );
}

export function PropertiesDiscoveryPage() {
  const t = useTranslations('search.results');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<View>('list');

  const {
    data,
    loading,
    error,
    filters,
    activeCount,
    search,
    setPage,
    resetFilters,
    removeFilter,
    repli,
    retirerTerme,
  } = useSearch();

  const properties = data?.data ?? [];
  const meta = data?.meta;

  // TCK-335 — le retour arrière repartait du haut. En traversée d'historique, Next ne
  // reprend pas la main sur le défilement : c'est la restauration NATIVE qui opère, et
  // elle opère pendant que cette page rend ses 10 squelettes (`CardSkeleton` ci-dessous)
  // pour 30 résultats à venir. Un document au tiers de sa hauteur écrête 1 200 px à 0.
  // Le signal passé au hook est donc « le commit porte les résultats », c'est-à-dire la
  // retombée de `loading` — et non le montage. `loading` couvre les trois issues (résultats,
  // liste vide, erreur) : la hauteur du document est arrêtée dans chacune.
  useScrollRestoration(!loading);

  // TCK-335 — un 422 nomme le filtre en cause dans `errors.<champ>`. S'il en désigne
  // UN SEUL et qu'il appartient bien à `SearchFilters`, on propose de retirer celui-là
  // plutôt que d'effacer toute la recherche : l'utilisateur garde son travail.
  //
  // ⚠ On n'affiche JAMAIS la prose de validation du serveur ici. Mesuré : le 422 de
  // `furnished` rend « The furnished field must be true or false. » sous `Accept-Language`
  // fr, en ET wo — `lang/fr/validation.php` ne porte pas la clé `boolean`. Le libellé
  // vient donc du dictionnaire du front, comme le veut le principe non négociable n°5.
  const cleFautive = (() => {
    if (!(error instanceof ApiError) || error.status !== 422) return null;
    const champs = Object.keys(error.validationErrors ?? {});
    if (champs.length !== 1) return null;
    const champ = champs[0] as keyof SearchFilters;
    return champ in filters || FILTRES_CONNUS.has(champ) ? champ : null;
  })();

  const handleFilterChange = (
    patch: Partial<SearchFilters>,
    options?: { continu?: boolean },
  ) => {
    // TCK-335, étape 5 — un commit de champ CONTINU écrase l'entrée d'historique ; tout le
    // reste l'empile. Voir le docblock de `search()` : `push` partout serait pire que le
    // `replace` d'origine tant que l'anti-rebond de l'étape 3 n'est pas en place.
    search({ ...filters, ...patch }, { historique: options?.continu ? 'replace' : 'push' });
  };

  // Derive the map filters from the active search filters. We only forward
  // the subset that the backend's `/map` endpoint supports.
  const mapFilters: Record<string, string | number | undefined> = {
    type: filters.type?.join(','),
    contract_type: filters.contract_type,
    price_min: filters.price_min,
    price_max: filters.price_max,
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />

      <div className="h-[133px]" />

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-16 py-8">
        <div className="flex gap-6 items-start">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={resetFilters}
            activeCount={activeCount}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <main className="flex-1 min-w-0">
            <SearchToolbar
              total={error ? null : (meta?.total ?? 0)}
              loading={loading}
              filters={filters}
              activeCount={activeCount}
              onRemoveFilter={(key, subKey) => {
                if (key === 'type' && subKey) {
                  const next = (filters.type ?? []).filter((t) => t !== subKey);
                  handleFilterChange({
                    type: next.length > 0 ? next : undefined,
                  });
                } else {
                  removeFilter(key);
                }
              }}
              onSortChange={(sort) => handleFilterChange({ sort })}
              onPerPageChange={(per_page) => handleFilterChange({ per_page })}
              onOpenSidebar={() => setSidebarOpen(true)}
            />

            <div className="mb-5 flex flex-wrap items-center gap-3">
              <ViewToggle view={view} onChange={setView} />
              <SaveSearchButton
                filters={filters}
                activeCount={activeCount}
                className="ml-auto"
              />
            </div>

            {view === 'map' ? (
              <PropertyMap filters={mapFilters} />
            ) : (
              <>
                {/*
                  TCK-338 — l'étiquette du repli conjonctif, au-dessus des résultats qu'elle
                  qualifie et sous le compteur qu'elle relativise.

                  Trois conditions, et chacune écarte une affirmation concurrente :
                  · `repli` est `null` sous le régime nominal — rien à dire, rien d'affiché ;
                  · `!error` — un bandeau d'erreur et un « voici 63 biens proches » sur le même
                    écran se contrediraient, comme l'état vide et l'erreur avant TCK-335 ;
                  · vue LISTE seulement — `/map` est un autre endpoint, qui ne reçoit même pas
                    `q` (cf. `mapFilters` ci-dessus) : l'étiquette y parlerait de résultats que
                    la carte n'affiche pas.
                */}
                {repli && !error && (
                  <WidenedSearchNotice
                    className="mb-5"
                    termesSansResultat={repli.termesSansResultat}
                    totalElargi={repli.totalElargi}
                    onRetirerTerme={retirerTerme}
                    onEffacerRecherche={() => search({ q: '' })}
                  />
                )}

                {error && !loading && (
                  <ErrorState
                    className="mb-6"
                    message={
                      error instanceof ApiError && error.status === 422
                        ? cleFautive
                          ? t('error_invalid_filter_named', { filter: cleFautive })
                          : t('error_invalid_filter')
                        : t('error')
                    }
                    onRetry={cleFautive ? () => removeFilter(cleFautive) : resetFilters}
                    retryLabel={cleFautive ? t('error_retry') : t('empty_cta')}
                  />
                )}

                <div
                  className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-12 transition-opacity duration-200 ${
                    loading
                      ? 'opacity-50 pointer-events-none'
                      : 'opacity-100'
                  }`}
                >
                  {loading && properties.length === 0 ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <CardSkeleton key={i} />
                    ))
                  ) : properties.length === 0 && !loading && !error ? (
                    // TCK-335 — `!error` : l'état vide et l'état d'erreur s'excluent.
                    // Ils s'affichaient ensemble, si bien qu'un filtre invalide produisait
                    // « 0 biens trouvés » ET « Aucun bien trouvé » ET « Une erreur est
                    // survenue » sur le même écran — trois affirmations concurrentes.
                    <SearchEmpty onReset={resetFilters} />
                  ) : (
                    properties.map((property, i) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        index={i}
                        priority={i < 4}
                      />
                    ))
                  )}
                </div>

                {meta && meta.last_page > 1 && (
                  <Pagination
                    currentPage={meta.current_page}
                    lastPage={meta.last_page}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
