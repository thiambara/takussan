'use client';
import { useCallback, useEffect, useState } from 'react';
import { clearRecent, readRecent, type RecentItem } from '@/lib/recently-viewed';

export function useRecentlyViewed(excludeId?: number) {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    setItems(readRecent(excludeId));
  }, [excludeId]);

  const clear = useCallback(() => {
    clearRecent();
    setItems([]);
  }, []);

  return { items, clear };
}
