'use client';

import { useState } from 'react';
import { Heart, Loader2, SearchX, Trash2 } from 'lucide-react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useTranslations } from 'next-intl';
import { PropertyCard } from '@/components/property/PropertyCard';
import { useFavoritesQuery, useRemoveFavoriteMutation } from '@/lib/queries/favorites';
import {
  FavoriteNote,
  normalizeFavoriteProperty,
  type UnavailableFavorite,
} from '@/components/favorites/FavoriteNote';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Pagination } from '@/components/console/Pagination';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CARD_SIZES_FAVORITES_DASHBOARD } from '@/components/property/card-image-sizes';

/**
 * Dashboard "Mes favoris" listing — Wave 3 / TCK-047, revu par TCK-599.
 *
 * TCK-599 (C16) — un favori ne décrit plus un bien sorti du public : l'API ne rend la carte
 * complète que pour un bien `available`, une projection `{ id, slug, title }` sinon, et rien du
 * tout pour un bien supprimé. La liste rend donc deux sortes de cartes : la carte canonique, et
 * une carte ÉTEINTE qui nomme la raison, ne montre ni prix ni localisation, et propose de retirer
 * le favori. La liste est paginée (l'API borne `per_page` à 50) et chaque favori disponible porte
 * sa note personnelle, éditable en place.
 */
const PER_PAGE = 24;

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

/**
 * La carte d'un favori qui n'est plus disponible : éteinte, sans prix ni localisation (l'API ne
 * les rend plus), avec la raison en clair et deux gestes — retirer, ou repartir chercher.
 */
function UnavailableFavoriteCard({ item }: { item: UnavailableFavorite }) {
  const t = useTranslations('favorites.page');
  const remove = useRemoveFavoriteMutation();
  const [error, setError] = useState(false);
  const title = item.property?.title ?? t('removedTitle');

  async function handleRemove() {
    setError(false);
    try {
      await remove.mutateAsync({ property_id: item.property_id });
    } catch {
      setError(true);
    }
  }

  return (
    <article
      data-testid="favorite-unavailable"
      data-availability={item.availability}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4"
    >
      <div className="flex aspect-4/3 w-full items-center justify-center rounded-lg bg-muted">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <span className="inline-flex rounded-full bg-background px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {t(`availability.${item.availability}`)}
        </span>
        <h3 className="mt-2 line-clamp-2 font-semibold text-muted-foreground">{title}</h3>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleRemove} disabled={remove.isPending}>
          {remove.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
          {t('remove')}
        </Button>
        <LienLocalise href="/properties" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          {t('similar')}
        </LienLocalise>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t('removeError')}
        </p>
      ) : null}
    </article>
  );
}

export function FavoritesList() {
  const t = useTranslations('favorites.page');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  const query = useFavoritesQuery({ page, per_page: PER_PAGE });

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
  const lastPage = query.data?.meta?.last_page ?? 1;
  if (favorites.length === 0 && page === 1) {
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
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
        {favorites.map((item, i) =>
          item.availability === 'available' ? (
            <div key={item.id}>
              <PropertyCard
                property={normalizeFavoriteProperty(item.property)}
                index={i}
                priority={page === 1 && i < 3}
                sizes={CARD_SIZES_FAVORITES_DASHBOARD}
              />
              <FavoriteNote item={item} />
            </div>
          ) : (
            <UnavailableFavoriteCard key={item.id} item={item} />
          ),
        )}
      </div>
      <Pagination page={page} lastPage={lastPage} onChange={setPage} />
    </div>
  );
}
