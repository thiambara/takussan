'use client';
import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from '@/lib/queries/favorites';
import { useFavorites } from '@/lib/favoritesStore';

/**
 * Single-property favorite toggle. Always reads from the favorites store
 * (the canonical client cache), so every surface — navbar popover, property
 * cards, detail page heart — stays in sync after a single click. For
 * authenticated users, the store flip is mirrored to the API and rolled back
 * on error.
 *
 * The legacy `initialFavoriteId` argument is accepted for backwards
 * compatibility with existing callers but is now a no-op: the store seeded
 * by AuthContext on login is the source of truth.
 */
export function useFavorite(propertyId: number, _initialFavoriteId: number | null = null) {
  void _initialFavoriteId;
  const { user } = useAuth();
  const { has, add, remove } = useFavorites();
  const addMutation = useAddFavoriteMutation();
  const removeMutation = useRemoveFavoriteMutation();

  const isFavorite = has(propertyId);
  const loading = addMutation.isPending || removeMutation.isPending;

  const toggle = useCallback(async (): Promise<void> => {
    const wasFavorite = has(propertyId);
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
      if (wasFavorite) add(propertyId);
      else remove(propertyId);
    }
  }, [user, propertyId, has, add, remove, addMutation, removeMutation]);

  return { isFavorite, toggle, loading };
}
