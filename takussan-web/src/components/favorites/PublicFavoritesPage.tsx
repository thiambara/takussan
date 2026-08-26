'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { EmptyState, ErrorState } from '@/components/feedback';
import { PropertyCard } from '@/components/property/PropertyCard';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useFavorites,
  remove as storeRemove,
} from '@/lib/favoritesStore';
import { usePropertiesByIdsChunkedQuery } from '@/lib/queries/favorites';
import { CARD_SIZES_FAVORITES_PUBLIC } from '@/components/property/card-image-sizes';

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
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
          <PublicFavoritesEmpty />
        ) : query.isError ? (
          // Pas d'`onRetry` : `usePropertiesByIdsChunkedQuery` agrège plusieurs requêtes et
          // n'expose pas de `refetch`. Un bouton qui n'aurait rien à appeler serait pire que
          // pas de bouton.
          <ErrorState message={t('error')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
            {ordered.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                index={i}
                priority={i < 3}
                sizes={CARD_SIZES_FAVORITES_PUBLIC}
              />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function PublicFavoritesEmpty() {
  const t = useTranslations('favorites.page');
  return (
    <EmptyState
      icon={<Heart className="size-8" aria-hidden="true" />}
      title={t('empty')}
      description={t('emptyHint')}
      action={
        <Link href="/properties" className={buttonVariants()}>
          {t('discoverCta')}
        </Link>
      }
    />
  );
}
