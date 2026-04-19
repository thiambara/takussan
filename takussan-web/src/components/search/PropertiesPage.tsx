'use client';

import React, { useState } from 'react';
import { SearchX } from 'lucide-react';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { PropertyCard } from '@/components/home/PropertyCard';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterSidebar } from './FilterSidebar';
import { SearchToolbar } from './SearchToolbar';
import { Pagination } from './Pagination';
import { useSearch } from '@/hooks/useSearch';
import type { SearchFilters } from '@/types/search';

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
      <h3 className="text-lg font-bold text-gray-700 mb-1">Aucun bien trouvé</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-xs">
        Essayez d'élargir vos critères de recherche ou de supprimer certains filtres.
      </p>
      <button
        onClick={onReset}
        className="text-sm font-semibold text-[#0050cb] underline underline-offset-4 hover:text-[#0043a8] transition-colors"
      >
        Effacer tous les filtres
      </button>
    </div>
  );
}

export function PropertiesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <Navbar />

      {/* Spacer under fixed navbar (navbar row1 ~65px + category row2 ~68px) */}
      <div className="h-[133px]" />

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-16 py-8">
        <div className="flex gap-6 items-start">

          {/* ── Sidebar ── */}
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={resetFilters}
            activeCount={activeCount}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0">
            <SearchToolbar
              total={meta?.total ?? 0}
              loading={loading}
              filters={filters}
              activeCount={activeCount}
              onRemoveFilter={(key) => removeFilter(key)}
              onSortChange={(sort) => handleFilterChange({ sort })}
              onPerPageChange={(per_page) => handleFilterChange({ per_page })}
              onOpenSidebar={() => setSidebarOpen(true)}
            />

            {/* Error state */}
            {error && !loading && (
              <div className="py-16 text-center text-sm text-gray-400">
                Une erreur est survenue. Veuillez réessayer.
              </div>
            )}

            {/* Grid */}
            <div
              className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-12 transition-opacity duration-200 ${
                loading ? 'opacity-50 pointer-events-none' : 'opacity-100'
              }`}
            >
              {loading && properties.length === 0
                ? Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)
                : properties.length === 0 && !loading
                  ? <EmptyState onReset={resetFilters} />
                  : properties.map((property, i) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        index={i}
                        priority={i < 4}
                      />
                    ))
              }
            </div>

            {/* Pagination */}
            {meta && meta.last_page > 1 && (
              <Pagination
                currentPage={meta.current_page}
                lastPage={meta.last_page}
                onPageChange={setPage}
              />
            )}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
