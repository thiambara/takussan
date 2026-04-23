'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from '@/lib/queries/favorites';

/**
 * Heart button — toggles a property's favorite state.
 *
 * Wave 3 — TCK-047.
 *
 * - Connected user → `POST /api/favorites` / `DELETE /api/favorites/{property}`.
 *   (Uses the property id on delete as documented in
 *   `src/lib/queries/favorites.ts`.)
 * - Anonymous user → redirected to `/auth/login?redirect=<current path>`
 *   or a local-storage fallback if `requireAuth=false`.
 *
 * Absorbs the parent `<Link>` click so the user stays on the card.
 */
const LS_KEY = 'takussan.favorites';

function readLocal(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as number[];
  } catch {
    return [];
  }
}

function writeLocal(ids: number[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

export interface FavoriteButtonProps {
  readonly propertyId: number;
  /** If the caller already knows whether this property is favorited, pass it in to avoid flicker. */
  readonly initialIsFavorite?: boolean;
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Route to `/auth/login` when logged out; default true. */
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
  initialIsFavorite = false,
  className = '',
  size = 'md',
  requireAuth = true,
}: FavoriteButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const addMutation = useAddFavoriteMutation();
  const removeMutation = useRemoveFavoriteMutation();

  // Optimistic toggle state — primed from the prop and from localStorage
  // (for the signed-out case).
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);

  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  useEffect(() => {
    if (!user) {
      setIsFavorite(readLocal().includes(propertyId));
    }
  }, [user, propertyId]);

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

      if (!user) {
        if (requireAuth) {
          router.push(redirectHref);
          return;
        }
        // Local fallback for unauthenticated users.
        const current = readLocal();
        const next = current.includes(propertyId)
          ? current.filter((id) => id !== propertyId)
          : [...current, propertyId];
        writeLocal(next);
        setIsFavorite(next.includes(propertyId));
        return;
      }

      // Optimistic flip; roll back on error.
      const previous = isFavorite;
      setIsFavorite(!previous);
      try {
        if (previous) {
          await removeMutation.mutateAsync({ property_id: propertyId });
        } else {
          await addMutation.mutateAsync({ property_id: propertyId });
        }
      } catch {
        setIsFavorite(previous);
      }
    },
    [user, requireAuth, router, redirectHref, propertyId, isFavorite, addMutation, removeMutation],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
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
