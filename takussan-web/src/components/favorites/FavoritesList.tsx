'use client';

import { useState } from 'react';
import { Heart, Loader2, NotebookPen, SearchX, Trash2 } from 'lucide-react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useTranslations } from 'next-intl';
import { PropertyCard } from '@/components/property/PropertyCard';
import {
  FAVORITE_NOTES_MAX,
  useFavoritesQuery,
  useRemoveFavoriteMutation,
  useUpdateFavoriteNotesMutation,
  type FavoriteItem,
} from '@/lib/queries/favorites';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Pagination } from '@/components/console';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { PropertyListItem } from '@/types/property';
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

type AvailableFavorite = Extract<FavoriteItem, { availability: 'available' }>;
type UnavailableFavorite = Exclude<FavoriteItem, { availability: 'available' }>;

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

function normalizeFavoriteProperty(property: AvailableFavorite['property']): PropertyListItem {
  // The API returns the property via `PropertyResource::make()` — the shape is
  // a superset of PropertyListItem. We trust the backend to provide the listed
  // fields and cast defensively to avoid TS complaining about the extra keys.
  const raw = { ...property } as unknown as Partial<PropertyListItem> & {
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

function FavoriteNote({ item }: { item: AvailableFavorite }) {
  const t = useTranslations('favorites.page.note');
  const update = useUpdateFavoriteNotesMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.notes ?? '');
  const [error, setError] = useState(false);
  const fieldId = `favorite-note-${item.id}`;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(false);
    try {
      await update.mutateAsync({ property_id: item.property_id, notes: draft });
      setEditing(false);
    } catch {
      setError(true);
    }
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-start gap-2 text-sm">
        {item.notes ? (
          <p className="min-w-0 flex-1 whitespace-pre-line break-words text-muted-foreground">{item.notes}</p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(item.notes ?? '');
            setEditing(true);
          }}
          className={item.notes ? 'shrink-0' : '-ml-2'}
        >
          <NotebookPen className="size-4" aria-hidden="true" />
          {item.notes ? t('edit') : t('add')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-2 space-y-2">
      <label htmlFor={fieldId} className="sr-only">
        {t('label')}
      </label>
      <Textarea
        id={fieldId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={FAVORITE_NOTES_MAX}
        rows={3}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t('count', { count: draft.length, max: FAVORITE_NOTES_MAX })}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('save')}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t('error')}
        </p>
      ) : null}
    </form>
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
