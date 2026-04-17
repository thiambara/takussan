'use client';
import { Suspense } from 'react';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertySkeleton } from '@/components/properties/PropertySkeleton';
import { SearchFilters } from '@/components/search/SearchFilters';
import { useSearch } from '@/hooks/useSearch';
import { SortDropdown } from '@/components/search/SortDropdown';

function HomeContent() {
  const { data, loading, error, filters, search } = useSearch();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">
          Annonces immobilières à Dakar
        </h1>
        <p className="mt-2 text-stone-500 leading-relaxed">
          Trouvez votre appartement, maison ou villa dans les meilleurs quartiers de Dakar.
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-8 items-start">
        <SearchFilters filters={filters} onSearch={search} />

        <div>
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-center mb-6">
              <p className="font-medium">Impossible de charger les annonces.</p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-500">
              {data && !loading ? `${data.meta.total} annonce${data.meta.total > 1 ? 's' : ''}` : ''}
            </p>
            <SortDropdown
              value={filters.sort}
              onChange={sort => search({ ...filters, sort, page: undefined })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <PropertySkeleton key={i} />)
              : data?.data.map(p => <PropertyCard key={p.id} property={p} />)
            }
          </div>

          {!loading && data?.data.length === 0 && (
            <div className="py-20 text-center text-stone-400">
              <p className="text-lg font-medium">Aucune annonce ne correspond à vos critères.</p>
              <p className="text-sm mt-2">Essayez d&apos;élargir vos filtres.</p>
            </div>
          )}

          {!loading && data && data.meta.last_page > 1 && (
            <div className="mt-10 flex justify-center gap-3">
              <button
                onClick={() => search({ ...filters, page: Math.max(1, (filters.page ?? 1) - 1) })}
                disabled={(filters.page ?? 1) <= 1}
                className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium disabled:opacity-40 hover:bg-stone-100 transition-colors duration-150"
              >
                Précédent
              </button>
              <span className="px-4 py-2 text-sm text-stone-600">
                Page {data.meta.current_page} / {data.meta.last_page}
              </span>
              <button
                onClick={() => search({ ...filters, page: Math.min(data.meta.last_page, (filters.page ?? 1) + 1) })}
                disabled={(filters.page ?? 1) >= data.meta.last_page}
                className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium disabled:opacity-40 hover:bg-stone-100 transition-colors duration-150"
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
