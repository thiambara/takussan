'use client';
import { useState } from 'react';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertySkeleton } from '@/components/properties/PropertySkeleton';
import { useProperties } from '@/hooks/useProperties';

export default function HomePage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useProperties(page);

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

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-center mb-8">
          <p className="font-medium">Impossible de charger les annonces.</p>
          <p className="text-sm mt-1">Vérifiez votre connexion et réessayez.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <PropertySkeleton key={i} />)
          : data?.data.map(p => <PropertyCard key={p.id} property={p} />)
        }
      </div>

      {!loading && data && data.meta.last_page > 1 && (
        <div className="mt-10 flex justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium disabled:opacity-40 hover:bg-stone-100 transition-colors duration-150"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-sm text-stone-600">
            Page {data.meta.current_page} / {data.meta.last_page}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.meta.last_page, p + 1))}
            disabled={page === data.meta.last_page}
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium disabled:opacity-40 hover:bg-stone-100 transition-colors duration-150"
          >
            Suivant
          </button>
        </div>
      )}

      {!loading && data?.data.length === 0 && (
        <div className="py-20 text-center text-stone-400">
          <p className="text-lg font-medium">Aucune annonce disponible pour le moment.</p>
          <p className="text-sm mt-2">
            Revenez bientôt, de nouveaux biens arrivent chaque semaine.
          </p>
        </div>
      )}
    </div>
  );
}
