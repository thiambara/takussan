'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { SuggestResponse } from '@/types/search';
import type { UseQueryResult } from '@tanstack/react-query';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useSuggest(
  q: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<SuggestResponse> {
  const locale = useLocale();
  const debouncedQ = useDebouncedValue(q, 150);
  const enabled = (options.enabled ?? true) && debouncedQ.length >= 1;

  return useApiQuery<SuggestResponse>(
    ['search', 'suggest', locale, debouncedQ],
    '/api/search/suggest',
    {
      params: { extra: { q: debouncedQ, limit: 10 } },
      enabled,
      staleTime: 60_000,
    },
  );
}
