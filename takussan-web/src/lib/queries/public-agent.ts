import { cache } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { PublicReview } from '@/components/public/profile/ReviewsSection';
import type { PropertyListItem } from '@/types/property';

export interface AgentStats {
  rent_count: number;
  sale_count: number;
  cities: number;
  years: number | null;
}

export interface AgentDto {
  id: number;
  slug: string;
  full_name: string;
  bio?: string | null;
  // TCK-441 — `email` N'EST PLUS servi par l'API : c'est l'adresse de CONNEXION de l'agent, et
  // elle a quitté la charge publique. Le contact passe par le formulaire anonyme de
  // `ContactSheet`, sans compte à créer.
  phone: string | null;
  city?: string | null;
  preferred_language?: string | null;
  specialty?: string | null;
  years_of_experience?: number | null;
  avatar_url: string | null;
  agency: { id: number; name: string; slug: string } | null;
  portfolio_count: number;
  portfolio_total: number;
  portfolio: PropertyListItem[];
  stats?: AgentStats;
  reviews?: {
    average: number | null;
    count: number;
    recent: PublicReview[];
  };
}

/**
 * Ce que la fiche publique d'agent a obtenu du serveur — **trois issues, jamais deux** (TCK-438).
 *
 * Jumelle stricte de {@link import('./public-agency').ResultatFicheAgence} : même défaut d'origine
 * (`catch { return null }` puis `notFound()`), même incident mesuré le 2026-08-27 (une API arrêtée
 * faisait rendre 404 à `/fr/agents/dakar-immo-agent-1`, un agent qui existe), même remède. Le
 * raisonnement complet est dans le module d'agence, écrit une seule fois ; il n'est pas recopié
 * ici pour qu'il n'y ait qu'un endroit à corriger.
 */
export type ResultatFicheAgent =
  | { readonly etat: 'trouve'; readonly agent: AgentDto }
  | { readonly etat: 'introuvable' }
  | { readonly etat: 'indisponible' };

/**
 * L'agent public d'un slug, **une seule fois par requête HTTP** — `cache()` mémoïse pour la durée
 * du rendu, si bien que `generateMetadata` et la page partagent un unique aller-retour.
 *
 * ⚠️ La locale est un ARGUMENT : elle entre dans la clé de mémoïsation, et `apiFetch` la devinerait
 * sinon depuis `document.cookie`, absent en rendu serveur.
 */
export const getAgent = cache(async (slug: string, locale: string): Promise<ResultatFicheAgent> => {
  try {
    const res = await apiFetch<{ data: AgentDto }>(
      `/public/agents/${encodeURIComponent(slug)}`,
      undefined,
      { locale },
    );
    return { etat: 'trouve', agent: res.data };
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 404) return { etat: 'introuvable' };

    console.error(`[fiche agent] ${slug} : `, err);
    return { etat: 'indisponible' };
  }
});
