'use client';

import { useLocale } from 'next-intl';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SuggestResponse } from '@/types/search';
import type { UseQueryResult } from '@tanstack/react-query';

export function useSuggest(
  q: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<SuggestResponse> {
  const locale = useLocale();
  // TCK-335 — l'implémentation était une copie LOCALE de ce fichier, non exportée : le seul
  // anti-rebond générique du dépôt, et personne ne pouvait s'en servir. Elle vit désormais dans
  // `@/hooks/useDebouncedValue`, dont `FilterSidebar` est le second appelant.
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
