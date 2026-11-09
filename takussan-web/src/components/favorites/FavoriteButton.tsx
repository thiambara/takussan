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
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { retenirLePrixVuALAjout } from '@/lib/favoris-suivi';

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
  /** `xs` (28 px) : les cartes denses des rangées de l'accueil (TCK-628). */
  readonly size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Route to `/auth/login` when logged out; default false (anonymous likes). */
  readonly requireAuth?: boolean;
  /**
   * TCK-2508 — le prix public affiché au moment du geste. L'anonyme le garde comme référence
   * (« −50 000 F depuis l'ajout ») ; absent, il est relu par `by-ids` juste après l'ajout.
   */
  readonly prix?: number | null;
  /**
   * TCK-2503 — posé sur la photo d'ouverture de la fiche, à côté du retour et du partage : la même
   * pastille pleine qu'eux (`bg-card`) plutôt que le voile des cartes de liste.
   */
  readonly surPhoto?: boolean;
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const ICON_CLASSES = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function FavoriteButton({
  propertyId,
  className = '',
  size = 'md',
  requireAuth = false,
  prix,
  surPhoto = false,
}: FavoriteButtonProps) {
  const t = useTranslations('favorites.button');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();

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
      else add(propertyId, prix);

      if (!user) {
        // TCK-2508 — l'anonyme n'a pas de `price_at_favorite` côté API : son prix de référence
        // se garde dans l'appareil, relu au moment du geste quand la carte ne l'a pas fourni.
        if (!wasFavorite && typeof prix !== 'number') void retenirLePrixVuALAjout(propertyId);
        return;
      }

      try {
        if (wasFavorite) {
          await removeMutation.mutateAsync({ property_id: propertyId });
        } else {
          await addMutation.mutateAsync({ property_id: propertyId });
        }
      } catch (error) {
        // Rollback on API failure.
        if (wasFavorite) add(propertyId);
        else remove(propertyId);
        // P243.02 (TCK-2371) — le cœur revenait sans un mot : le refus se dit.
        toast.add({ title: t('refusedTitle'), description: messageErreur(error), type: 'error' });
      }
    },
    [user, requireAuth, router, redirectHref, propertyId, prix, has, add, remove, addMutation, removeMutation, toast, t, messageErreur],
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
          ? // TCK-2508 — le cœur plein est terracotta (`--primary`), plus le rouge vif de l'alerte.
            'bg-card text-primary shadow-md'
          : surPhoto
            ? 'bg-card text-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklab,var(--shadow-color)_35%,transparent)] hover:text-primary'
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
