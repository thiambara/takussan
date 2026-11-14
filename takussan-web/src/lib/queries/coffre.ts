'use client';

import { keepPreviousData } from '@tanstack/react-query';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { CoffreDeDocuments, RechercheDansLeCoffre } from '@/lib/documents/coffre';

/**
 * TCK-2656 — le coffre de l'appelant, `GET /api/me/document-vault` (TCK-2655, ADR-0099) : ses
 * dossiers selon le profil actif, chaque entrée jugée par la règle de l'endpoint qui la sert.
 *
 * Pas de `fields[...]` : la réponse n'est pas une ressource spatie, c'est un agrégat de forme fixe.
 */
export const coffreQueryKeys = {
  all: ['documents', 'coffre'] as const,
  recherche: (q: string, page: number) => ['documents', 'coffre', 'recherche', q, page] as const,
};

/** Une page de résultats : la taille par défaut de l'API. */
export const TROUVEES_PAR_PAGE = 20;

export function useCoffreDeDocuments({ enabled = true }: { readonly enabled?: boolean } = {}) {
  return useApiQuery<{ data: CoffreDeDocuments }>(coffreQueryKeys.all, '/api/me/document-vault', { enabled });
}

/**
 * TCK-2769 — chercher dans le coffre : `filter[search]` jugé par le serveur, qui rend les entrées du
 * coffre qui correspondent (documents générés compris), le total et les pages. Jamais un filtre du
 * coffre chargé.
 */
export function useRechercheDansLeCoffre(q: string, page: number) {
  return useApiQuery<RechercheDansLeCoffre>(coffreQueryKeys.recherche(q, page), '/api/me/document-vault', {
    params: { filter: { search: q }, page, per_page: TROUVEES_PAR_PAGE },
    enabled: q !== '',
    // D'une page à l'autre, la page lue reste affichée jusqu'à l'arrivée de la suivante.
    placeholderData: keepPreviousData,
  });
}
