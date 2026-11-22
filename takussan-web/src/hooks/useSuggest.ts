'use client';

import { useLocale } from 'next-intl';
import { keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SuggestResponse } from '@/types/search';

/**
 * TCK-2475 — l'anti-rebond de la frappe. Revue adverse du 2026-11-04 (défaut n° 6) : à 100 ms, une frappe normale (une
 * touche toutes les 150 ms) envoyait chaque touche au serveur — 29 appels pour 31 caractères, face à la borne
 * `search-suggest` de 60 par minute. À 200 ms, la frappe continue ne part qu'à sa pause ; « rien ne clignote » tient par
 * `keepPreviousData`, pas par la vitesse de l'anti-rebond.
 */
export const DELAI_DE_SUGGESTION_MS = 200;

/**
 * La saisie telle que le serveur la lit : rognée, espaces intérieurs réduits à un. « villa␣␣almadies » et
 * « villa almadies » sont la même question, et la seconde ne repart pas au serveur (défaut n° 6). La barre compare SA
 * saisie sous cette forme à `pour`.
 */
export function normaliserSaisie(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

export interface OptionsDeSuggestion {
  enabled?: boolean;
  /**
   * TCK-2475 — interroger aussi sur une saisie VIDE : l'API rend alors les recherches populaires
   * (`popular`). Faux par défaut : l'état vide de la liste (`SearchEmpty`) n'en veut pas.
   */
  vide?: boolean;
  /**
   * Revue adverse du 2026-11-04 (défaut n° 5) — les filtres de la liste où mènera la suggestion (`filtresDeLaBase`), sous
   * les noms de la liste publique : le serveur compte la saisie comprise PAR-DESSUS, pour que « 12 biens » soit le total
   * de la liste ouverte. Fait partie de la clé de cache : une autre base est une autre question.
   */
  base?: URLSearchParams;
}

export type ResultatDeSuggestion = UseQueryResult<SuggestResponse> & {
  /**
   * La saisie (normalisée) à laquelle `data` RÉPOND, ou `undefined` si `data` est celle d'une saisie
   * précédente, gardée à l'écran pendant le chargement (`keepPreviousData`). C'est ce qui permet à
   * la barre de ne jamais VALIDER une compréhension périmée, tout en l'affichant sans clignoter.
   */
  pour?: string;
};

export function useSuggest(q: string, options: OptionsDeSuggestion = {}): ResultatDeSuggestion {
  const locale = useLocale();
  // TCK-335 — l'anti-rebond générique du dépôt (`@/hooks/useDebouncedValue`). Il porte sur la frappe BRUTE — une espace
  // tapée relance l'attente comme une lettre, sans quoi chaque fin de mot ferait une pause de deux touches et partirait —,
  // puis la saisie est normalisée : « appart » et « appart␣ » sont la même clé, et la seconde ne repart pas au serveur.
  const debouncedQ = normaliserSaisie(useDebouncedValue(q, DELAI_DE_SUGGESTION_MS));
  const base = options.base?.toString() ?? '';
  const enabled = (options.enabled ?? true) && (options.vide === true || debouncedQ.length >= 1);

  const resultat = useApiQuery<SuggestResponse>(
    ['search', 'suggest', locale, debouncedQ, base],
    '/api/search/suggest',
    {
      params: { extra: { ...Object.fromEntries(new URLSearchParams(base)), q: debouncedQ, limit: 10 } },
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
