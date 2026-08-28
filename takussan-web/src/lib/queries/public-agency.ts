import { cache } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { PublicReview } from '@/components/public/profile/ReviewsSection';
import type { PropertyListItem } from '@/types/property';

export interface AgencyAgentDto {
  id: number;
  slug: string | null;
  full_name: string;
  email?: string | null;
  avatar_url: string | null;
  specialty?: string | null;
  portfolio_count?: number;
}

export interface AgencyStats {
  rent_count: number;
  sale_count: number;
  cities: number;
  agents: number;
}

export interface AgencyDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  license_number: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  logo_url: string | null;
  agents: AgencyAgentDto[];
  portfolio_count: number;
  portfolio_total: number;
  portfolio: PropertyListItem[];
  stats?: AgencyStats;
  reviews?: {
    average: number | null;
    count: number;
    recent: PublicReview[];
  };
}

/**
 * Ce que la fiche publique d'agence a obtenu du serveur — **trois issues, jamais deux**.
 *
 * C'est la forme de {@link import('./public-property').ResultatFichePublique}, transposée
 * (TCK-438). Le code d'avant vivait dans `agencies/[slug]/page.tsx` et faisait
 * `try { … } catch { return null }`, puis `notFound()` sur ce `null` :
 *
 * ```
 * ❌ 5xx, API éteinte, JSON illisible  →  null  →  notFound()  →  « cette agence n'existe pas », 404
 * ```
 *
 * — c'est-à-dire une **affirmation fausse gravée dans le code de statut**. Mesuré ici même le
 * 2026-08-27 : le serveur d'API local s'est arrêté en cours de campagne, et
 * `/fr/agencies/dakar-immo` — une agence qui EXISTE, que l'API sert en 200 quand elle tourne —
 * a rendu **404**. La sonde posée dans le `catch` a nommé le vrai coupable :
 *
 * ```
 * [SONDE-G9] [TypeError: fetch failed] { [cause]: Error: connect ECONNREFUSED 127.0.0.1:8002 }
 * ```
 *
 * Le même incident, à la même seconde, laissait la fiche de bien répondre 200 « momentanément
 * indisponible » : TCK-335 avait corrigé ce défaut sur une fiche sur trois.
 *
 * - `introuvable` (**404 amont, et lui seul**) → `notFound()`, donc un VRAI 404 ;
 * - `indisponible` (**toute autre panne**) → écran explicite en 200, plus `robots: { index: false }`.
 *   L'agence existe peut-être ; on ne dit surtout pas qu'elle n'existe pas, et on n'invite pas
 *   l'indexation d'une page qui ne sait rien.
 *
 * ⚠️ Ne pas re-fusionner ces deux cas « pour simplifier » : remplacer un repli silencieux par un
 * autre repli silencieux ne corrige rien.
 */
export type ResultatFicheAgence =
  | { readonly etat: 'trouve'; readonly agence: AgencyDto }
  | { readonly etat: 'introuvable' }
  | { readonly etat: 'indisponible' };

/**
 * L'agence publique d'un slug, **une seule fois par requête HTTP**.
 *
 * `cache()` de React mémoïse par identité d'arguments pour la durée du rendu : `generateMetadata`
 * et la page appellent donc la même fonction et ne déclenchent **qu'un** aller-retour. C'est la
 * raison pour laquelle la locale est un ARGUMENT et non une déduction — elle entre dans la clé de
 * mémoïsation, et deux langues ne doivent pas partager une réponse.
 *
 * ⚠️ Le second motif de l'argument est celui déjà payé par `public-property.ts` : `apiFetch` devine
 * sinon la locale depuis `document.cookie`, qui n'existe pas en rendu serveur, et rend `undefined`
 * **en silence** — les libellés d'énumération sortiraient alors dans `APP_LOCALE`.
 */
export const getAgency = cache(
  async (slug: string, locale: string): Promise<ResultatFicheAgence> => {
    try {
      const res = await apiFetch<{ data: AgencyDto }>(
        `/public/agencies/${encodeURIComponent(slug)}`,
        undefined,
        { locale },
      );
      return { etat: 'trouve', agence: res.data };
    } catch (err: unknown) {
      // 404 : l'API a répondu, et elle dit que ce slug n'existe pas (ou n'est plus public).
      // C'est la SEULE panne dont on sache qu'elle mérite un 404.
      if (err instanceof ApiError && err.status === 404) return { etat: 'introuvable' };

      // Tout le reste — 5xx, 429, API éteinte, JSON illisible — est une panne de NOTRE côté.
      // Elle part au journal serveur : elle est utile au développeur, jamais au visiteur.
      console.error(`[fiche agence] ${slug} : `, err);
      return { etat: 'indisponible' };
    }
  },
);
