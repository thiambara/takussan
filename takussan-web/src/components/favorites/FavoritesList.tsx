'use client';

import { Heart } from 'lucide-react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useTranslations } from 'next-intl';
import { PropertyCard } from '@/components/property/PropertyCard';
import { useFavoritesQuery, type FavoriteItem } from '@/lib/queries/favorites';
import { EmptyState, ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PropertyListItem } from '@/types/property';
import { CARD_SIZES_FAVORITES_DASHBOARD } from '@/components/property/card-image-sizes';

/**
 * Dashboard "Mes favoris" listing — Wave 3 / TCK-047.
 *
 * Lists all properties the current user favorited. Uses the canonical
 * {@link PropertyCard} with the favorite button still on so users can
 * un-favorite in place (the list invalidates on mutation success).
 */
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

function normalizeFavoriteProperty(item: FavoriteItem): PropertyListItem {
  // The API returns the property via `PropertyResource::make()` — the shape is
  // a superset of PropertyListItem. We trust the backend to provide the listed
  // fields and cast defensively to avoid TS complaining about the extra keys.
  const raw = item.property as unknown as Partial<PropertyListItem> & {
    address?: { city?: string; region?: string; country?: string; quarter?: string; latitude?: number; longitude?: number };
    main_photo_url?: string | null;
  };
  // If the backend happens to return an `address` relation instead of the flat
  // `location`, patch it on the fly.
  if (!raw.location && raw.address) {
    raw.location = {
      quarter: raw.address.quarter ?? null,
      city: raw.address.city ?? null,
      region: raw.address.region ?? null,
      country: raw.address.country ?? null,
      latitude: raw.address.latitude ?? null,
      longitude: raw.address.longitude ?? null,
    };
  }
  return raw as PropertyListItem;
}

export function FavoritesList() {
  const t = useTranslations('favorites.page');
  const tCommon = useTranslations('common');
  const query = useFavoritesQuery({ per_page: 24 });

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
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

  const favorites = query.data?.data ?? [];
  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="size-8" aria-hidden="true" />}
        title={t('empty')}
        description={t('emptyHint')}
        action={
          <LienLocalise href="/properties" className={buttonVariants()}>
            {t('discoverCta')}
          </LienLocalise>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
      {favorites.map((item, i) => (
        <PropertyCard
          key={item.id}
          property={normalizeFavoriteProperty(item)}
          index={i}
          priority={i < 3}
          sizes={CARD_SIZES_FAVORITES_DASHBOARD}
        />
      ))}
    </div>
  );
}
