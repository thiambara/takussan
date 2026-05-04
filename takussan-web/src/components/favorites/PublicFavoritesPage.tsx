'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { PropertyCard } from '@/components/property/PropertyCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useFavorites,
  remove as storeRemove,
} from '@/lib/favoritesStore';
import { usePropertiesByIdsChunkedQuery } from '@/lib/queries/favorites';

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-4/3 w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function PublicFavoritesPage() {
  const t = useTranslations('favorites.page');
  const { ids, isHydrated, count } = useFavorites();

  // Most recent first.
  const lookupIds = useMemo(() => [...ids].reverse(), [ids]);
  const query = usePropertiesByIdsChunkedQuery(lookupIds);

  // Purge ghosts (unpublished / deleted) from the store so the badge stays
  // accurate.
  useEffect(() => {
    if (!query.data) return;
    const requested = new Set(query.data.meta.requested_ids);
    const returned = new Set(query.data.meta.returned_ids);
    requested.forEach((id) => {
      if (!returned.has(id)) storeRemove(id);
    });
  }, [query.data]);

  const ordered = useMemo(() => {
    if (!query.data) return [];
    const byId = new Map(query.data.data.map((p) => [p.id, p]));
    // Preserve the "most recent first" order from `lookupIds`.
    return lookupIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [query.data, lookupIds]);

  return (
    <div className="min-h-screen flex flex-col bg-app-bg">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-app-ink">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            {isHydrated ? t('subtitle', { count }) : t('subtitleLoading')}
          </p>
        </header>

        {!isHydrated || (count > 0 && query.isLoading) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
            {Array.from({ length: Math.max(3, Math.min(count, 6)) }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : count === 0 ? (
          <EmptyState />
        ) : query.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {t('error')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
            {ordered.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                index={i}
                priority={i < 3}
              />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function EmptyState() {
  const t = useTranslations('favorites.page');
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
      <Heart className="w-10 h-10 text-stone-300 mx-auto mb-3" />
      <h3 className="font-semibold text-stone-700 mb-1">{t('empty')}</h3>
      <p className="text-sm text-stone-500 mb-4">{t('emptyHint')}</p>
      <Link
        href="/properties"
        className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
      >
        {t('discoverCta')}
      </Link>
    </div>
  );
}
