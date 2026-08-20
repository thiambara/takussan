'use client';

import React, { useCallback, useMemo } from 'react';
import { Heart } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from '@/lib/queries/favorites';
import { useFavorites } from '@/lib/favoritesStore';
import { useTranslations } from 'next-intl';

/**
 * Heart button — toggles a property's favorite state.
 *
 * The favorites store is the single source of truth for both anonymous and
 * authenticated users — that's how every heart on the page (cards, detail
 * page, navbar popover) stays in sync after a single click.
 *
 * - Authenticated → optimistic store update + `POST/DELETE /api/favorites`,
 *   rollback the store on API error.
 * - Anonymous → store update only.
 *
 * Set `requireAuth={true}` to redirect to login when logged out.
 * Absorbs the parent `<Link>` click so the user stays on the card.
 */

export interface FavoriteButtonProps {
  readonly propertyId: number;
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Route to `/auth/login` when logged out; default false (anonymous likes). */
  readonly requireAuth?: boolean;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const ICON_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function FavoriteButton({
  propertyId,
  className = '',
  size = 'md',
  requireAuth = false,
}: FavoriteButtonProps) {
  const t = useTranslations('favorites.button');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const addMutation = useAddFavoriteMutation();
  const removeMutation = useRemoveFavoriteMutation();

  const { has, add, remove } = useFavorites();
  const isFavorite = has(propertyId);

  const redirectHref = useMemo(() => {
    const qs = searchParams.toString();
    const current = qs ? `${pathname}?${qs}` : pathname;
    return `/auth/login?redirect=${encodeURIComponent(current)}`;
  }, [pathname, searchParams]);

  const loading = addMutation.isPending || removeMutation.isPending;

  const handleClick = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!user && requireAuth) {
        router.push(redirectHref);
        return;
      }

      const wasFavorite = has(propertyId);
      // Optimistic store flip — every <FavoriteButton> + popover badge
      // re-renders immediately.
      if (wasFavorite) remove(propertyId);
      else add(propertyId);

      if (!user) return;

      try {
        if (wasFavorite) {
          await removeMutation.mutateAsync({ property_id: propertyId });
        } else {
          await addMutation.mutateAsync({ property_id: propertyId });
        }
      } catch {
        // Rollback on API failure.
        if (wasFavorite) add(propertyId);
        else remove(propertyId);
      }
    },
    [user, requireAuth, router, redirectHref, propertyId, has, add, remove, addMutation, removeMutation],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={t(isFavorite ? 'remove' : 'add')}
      aria-pressed={isFavorite}
      data-favorite={isFavorite ? 'true' : 'false'}
      className={`${SIZE_CLASSES[size]} rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-200 cursor-pointer disabled:cursor-wait ${
        isFavorite
          ? 'bg-white text-red-500 shadow-md'
          : 'bg-white/20 text-white hover:bg-white hover:text-primary'
      } ${className}`}
    >
      <Heart
        className={`${ICON_CLASSES[size]} transition-all ${isFavorite ? 'fill-current scale-110' : ''}`}
      />
    </button>
  );
}
