'use client';

import { useLocale } from 'next-intl';
import { keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SuggestResponse } from '@/types/search';

/** TCK-2475 — l'anti-rebond de la frappe : court, la réponse serveur tient en ~30 ms au p95. */
export const DELAI_DE_SUGGESTION_MS = 100;

export interface OptionsDeSuggestion {
  enabled?: boolean;
  /**
   * TCK-2475 — interroger aussi sur une saisie VIDE : l'API rend alors les recherches populaires
   * (`popular`). Faux par défaut : l'état vide de la liste (`SearchEmpty`) n'en veut pas.
   */
  vide?: boolean;
}

export type ResultatDeSuggestion = UseQueryResult<SuggestResponse> & {
  /**
   * La saisie (rognée) à laquelle `data` RÉPOND, ou `undefined` si `data` est celle d'une saisie
   * précédente, gardée à l'écran pendant le chargement (`keepPreviousData`). C'est ce qui permet à
   * la barre de ne jamais VALIDER une compréhension périmée, tout en l'affichant sans clignoter.
   */
  pour?: string;
};

export function useSuggest(q: string, options: OptionsDeSuggestion = {}): ResultatDeSuggestion {
  const locale = useLocale();
  // TCK-335 — l'anti-rebond générique du dépôt (`@/hooks/useDebouncedValue`). La saisie est rognée
  // AVANT : « appart » et « appart␣ » sont la même question, et la seconde ne repart pas au serveur.
  const debouncedQ = useDebouncedValue(q.trim(), DELAI_DE_SUGGESTION_MS);
  const enabled = (options.enabled ?? true) && (options.vide === true || debouncedQ.length >= 1);

  const resultat = useApiQuery<SuggestResponse>(
    ['search', 'suggest', locale, debouncedQ],
    '/api/search/suggest',
    {
      params: { extra: { q: debouncedQ, limit: 10 } },
      enabled,
      staleTime: 60_000,
      // Rien ne clignote : la réponse précédente reste affichée pendant que la suivante arrive.
      // Une réponse PÉRIMÉE (arrivée après une plus récente) ne l'écrase jamais : chaque saisie a sa
      // clé de cache, et l'écran lit celle de la saisie courante.
      placeholderData: keepPreviousData,
    },
  );

  const pour = resultat.data !== undefined && !resultat.isPlaceholderData ? debouncedQ : undefined;
  return { ...resultat, pour } as ResultatDeSuggestion;
}
