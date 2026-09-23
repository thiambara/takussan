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
import { ZONE_TACTILE_44 } from '@/lib/zone-tactile';

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
 *
 * TCK-554 — le bouton n'est plus DANS le lien de la carte, il en est le frère
 * (`LienDeCarte`) : un tap ne peut plus naviguer. `preventDefault` et `stopPropagation`
 * restent par défense, pour un appelant qui le poserait dans un conteneur cliquable.
 * Sa zone tactile fait 44 × 44 px quelle que soit sa taille dessinée (`ZONE_TACTILE_44`).
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
      // Au repos, un voile `bg-scrim/50` et non `bg-card/20` : un cœur crème sur un aplat crème à
      // 20 % disparaissait sur toute photo claire et sur le repli « Photo à venir » (revue design
      // du 2026-09-16). Le voile assombrit quel que soit le thème. À 30 %, un pixel blanc dessous
      // laissait l'icône à 2,01:1 ; à 50 %, le pire cas tient le seuil non textuel de 3:1.
      className={`${SIZE_CLASSES[size]} ${ZONE_TACTILE_44} rounded-full backdrop-blur-md flex items-center justify-center transition-[background-color,color,box-shadow,scale] duration-200 active:scale-[0.96] cursor-pointer disabled:cursor-wait ${
        isFavorite
          ? 'bg-card text-destructive shadow-md'
          : 'bg-scrim/50 text-primary-foreground hover:bg-card hover:text-primary'
      } ${className}`}
    >
      <Heart
        aria-hidden="true"
        className={`${ICON_CLASSES[size]} transition-transform ${isFavorite ? 'fill-current scale-110' : ''}`}
      />
    </button>
  );
}
