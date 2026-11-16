import { cache } from 'react';

import { apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-2862 — ce que la fiche publique LISTÉE de l'agent montre et que son formulaire ne porte pas : la
 * note, le délai de réponse habituel, le nombre de biens en ligne (`GET /api/public/agents/{slug}`, la
 * requête de sa page publique). Sans `public_slug` (fiche pas encore listée : l'API rendrait 404), ou
 * fiche illisible : `null` — l'aperçu dit alors « Visible après publication de votre fiche », jamais
 * un zéro inventé.
 */
export interface FaitsPublicsDeLaFiche {
  readonly note: { readonly moyenne: number; readonly nombre: number } | null;
  readonly delaiMinutes: number | null;
  readonly annonces: number;
}

interface FichePublique {
  readonly reviews?: { readonly average: number | null; readonly count: number };
  readonly median_response_minutes?: number | null;
  readonly portfolio_total?: number;
  readonly portfolio_count?: number;
}

export const faitsPublicsDeLaFiche = cache(
  async (slug: string | null | undefined, locale: string): Promise<FaitsPublicsDeLaFiche | null> => {
    if (!slug) return null;
    try {
      const res = await apiFetch<{ data: FichePublique }>(cheminApi`/public/agents/${slug}`, undefined, { locale });
      const { reviews, median_response_minutes, portfolio_total, portfolio_count } = res.data;
      return {
        note:
          reviews && reviews.count > 0 && reviews.average !== null
            ? { moyenne: reviews.average, nombre: reviews.count }
            : null,
        delaiMinutes: median_response_minutes ?? null,
        annonces: portfolio_total ?? portfolio_count ?? 0,
      };
    } catch {
      return null;
    }
  },
);
