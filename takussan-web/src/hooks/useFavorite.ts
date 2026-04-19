'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toggleFavoriteAction } from '@/app/actions/property';

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

export function useFavorite(propertyId: number, initialFavoriteId: number | null = null) {
  const { user } = useAuth();
  const [favoriteId, setFavoriteId] = useState<number | null>(initialFavoriteId);
  const [localFavorite, setLocalFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setLocalFavorite(readLocal().includes(propertyId));
    }
  }, [user, propertyId]);

  const isFavorite = user ? favoriteId !== null : localFavorite;

  async function toggle(): Promise<void> {
    if (loading) return;
    setLoading(true);
    try {
      if (user) {
        const res = await toggleFavoriteAction(propertyId, favoriteId);
        if (res.ok) setFavoriteId(res.data?.favorite_id ?? null);
      } else {
        const current = readLocal();
        const next = current.includes(propertyId)
          ? current.filter((id) => id !== propertyId)
          : [...current, propertyId];
        writeLocal(next);
        setLocalFavorite(next.includes(propertyId));
      }
    } finally {
      setLoading(false);
    }
  }

  return { isFavorite, toggle, loading };
}
