'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BookmarkCheck, Trash2, Loader2, Search as SearchIcon } from 'lucide-react';
import {
  useSavedSearchesQuery,
  useDeleteSavedSearchMutation,
  type SavedSearch,
} from '@/lib/queries/saved-searches';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format/currency';

/**
 * Dashboard "Mes recherches sauvegardées" listing — Wave 3 / TCK-047.
 *
 * For each saved search:
 * - Displays the name and a humanised summary of its criteria.
 * - Provides a "Relancer la recherche" link that rebuilds the URL for
 *   `/properties?` from the stored criteria JSON.
 * - Provides a "Supprimer" action that issues `DELETE /api/saved-searches/{id}`.
 */
function criteriaToQueryString(criteria: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(criteria).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else if (typeof value === 'object') {
      params.set(key, JSON.stringify(value));
    } else {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function humaniseCriteria(criteria: Record<string, unknown>): string {
  const parts: string[] = [];
  if (criteria.contract_type === 'sale') parts.push('Vente');
  if (criteria.contract_type === 'rent') parts.push('Location');
  if (typeof criteria.city === 'string' && criteria.city.length > 0) {
    parts.push(criteria.city);
  }
  if (typeof criteria.q === 'string' && criteria.q.length > 0) {
    parts.push(`"${criteria.q}"`);
  }
  if (Array.isArray(criteria.type) && criteria.type.length > 0) {
    parts.push(criteria.type.join(', '));
  }
  if (criteria.bedrooms != null) {
    parts.push(`${String(criteria.bedrooms)} ch.`);
  }
  if (criteria.price_min != null || criteria.price_max != null) {
    const min = criteria.price_min != null ? formatCurrency(Number(criteria.price_min)) : null;
    const max = criteria.price_max != null ? formatCurrency(Number(criteria.price_max)) : null;
    if (min && max) {
      parts.push(`${min} – ${max}`);
    } else if (max) {
      parts.push(`Maximum ${max}`);
    } else if (min) {
      parts.push(`Minimum ${min}`);
    }
  }
  if (criteria.area_min != null || criteria.area_max != null) {
    parts.push(
      `surface ${criteria.area_min ?? '…'} – ${criteria.area_max ?? '…'} m²`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : 'Aucun critère';
}

function SavedSearchRow({
  search,
  onDelete,
  deleting,
}: {
  search: SavedSearch;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const qs = criteriaToQueryString(search.criteria);
  const href = `/properties${qs ? `?${qs}` : ''}`;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-stone-900 truncate">
            {search.name}
          </h3>
        </div>
        <p className="mt-1 text-sm text-stone-500 truncate">
          {humaniseCriteria(search.criteria)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition"
        >
          <SearchIcon className="w-3.5 h-3.5" />
          Relancer
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(search.id)}
          disabled={deleting}
          aria-label={`Supprimer ${search.name}`}
          className="text-stone-500 hover:text-red-600"
        >
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </article>
  );
}

export function SavedSearchesList() {
  const query = useSavedSearchesQuery();
  const remove = useDeleteSavedSearchMutation();
  const [pendingId, setPendingId] = useState<number | null>(null);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Impossible de charger vos recherches pour le moment.
      </div>
    );
  }

  const searches = query.data?.data ?? [];
  if (searches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
        <BookmarkCheck className="w-10 h-10 text-stone-300 mx-auto mb-3" />
        <h3 className="font-semibold text-stone-700 mb-1">
          Aucune recherche sauvegardée
        </h3>
        <p className="text-sm text-stone-500 mb-4">
          Depuis la page résultats, cliquez sur « Sauvegarder la recherche »
          pour la retrouver ici.
        </p>
        <Link
          href="/properties"
          className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
        >
          Lancer une recherche
        </Link>
      </div>
    );
  }

  async function handleDelete(id: number) {
    setPendingId(id);
    try {
      await remove.mutateAsync({ id });
    } finally {
      setPendingId((current) => (current === id ? null : current));
    }
  }

  return (
    <div className="space-y-3">
      {searches.map((s) => (
        <SavedSearchRow
          key={s.id}
          search={s}
          onDelete={handleDelete}
          deleting={pendingId === s.id && remove.isPending}
        />
      ))}
    </div>
  );
}
