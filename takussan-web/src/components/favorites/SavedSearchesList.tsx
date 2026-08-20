'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BookmarkCheck, Trash2, Loader2, Search as SearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useSavedSearchesQuery,
  useDeleteSavedSearchMutation,
  type SavedSearch,
} from '@/lib/queries/saved-searches';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
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

function humaniseCriteria(criteria: Record<string, unknown>, repliAucunCritere: string): string {
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
  return parts.length > 0 ? parts.join(' · ') : repliAucunCritere;
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
  const t = useTranslations('search.saved');
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
          {humaniseCriteria(search.criteria, t('noCriteria'))}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition"
        >
          <SearchIcon className="w-3.5 h-3.5" />
          {t('relaunch')}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(search.id)}
          disabled={deleting}
          aria-label={t('deleteAria', { name: search.name })}
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
  const t = useTranslations('search.saved');
  const tCommon = useTranslations('common');
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
      <ErrorState
        message={t('error')}
        onRetry={() => void query.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const searches = query.data?.data ?? [];
  if (searches.length === 0) {
    return (
      <EmptyState
        icon={<BookmarkCheck className="size-8" aria-hidden="true" />}
        title={t('empty_title')}
        description={t('empty_description')}
        action={
          <Link href="/properties" className={buttonVariants()}>
            {t('empty_cta')}
          </Link>
        }
      />
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
