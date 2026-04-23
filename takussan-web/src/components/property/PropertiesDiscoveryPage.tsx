'use client';

import React, { useState } from 'react';
import { List, Map as MapIcon, SearchX } from 'lucide-react';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { SearchToolbar } from '@/components/search/SearchToolbar';
import { Pagination } from '@/components/search/Pagination';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PropertyMap } from '@/components/map';
import { SaveSearchButton } from '@/components/favorites/SaveSearchButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearch } from '@/hooks/useSearch';
import type { SearchFilters } from '@/types/search';

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

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center col-span-full">
      <SearchX className="w-12 h-12 text-gray-300 mb-4" />
      <h3 className="text-lg font-bold text-gray-700 mb-1">
        Aucun bien trouvé
      </h3>
      <p className="text-sm text-gray-400 mb-6 max-w-xs">
        Essayez d&apos;élargir vos critères de recherche ou de supprimer
        certains filtres.
      </p>
      <button
        onClick={onReset}
        className="text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80 transition-colors cursor-pointer"
      >
        Effacer tous les filtres
      </button>
    </div>
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
  return (
    <div
      role="tablist"
      aria-label="Vue des résultats"
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
        Liste
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
        Carte
      </button>
    </div>
  );
}

export function PropertiesDiscoveryPage() {
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
  } = useSearch();

  const properties = data?.data ?? [];
  const meta = data?.meta;

  const handleFilterChange = (patch: Partial<SearchFilters>) => {
    search({ ...filters, ...patch });
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
              total={meta?.total ?? 0}
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
                {error && !loading && (
                  <div className="py-16 text-center text-sm text-gray-400">
                    Une erreur est survenue. Veuillez réessayer.
                  </div>
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
                  ) : properties.length === 0 && !loading ? (
                    <EmptyState onReset={resetFilters} />
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
