'use client';

import { keepPreviousData } from '@tanstack/react-query';

import { CLE_CREDITS } from '@/components/boost/api';
import type { BoostKind, BoostStatus, BoostVariant, CreditLot, CreditsResponse } from '@/components/boost/types';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2664 — ce que la page Crédits lit en plus du solde (`useCredits`) et des offres
 * (`useBoostProducts`) : les mises en avant de l'espace et leurs mesures, les biens à pousser
 * (TCK-2663), et les biens en ligne parmi lesquels choisir.
 *
 * Les clés commencent par `credits` : un achat (`useBuyBoost`) invalide `['credits']`, et les
 * mises en avant comme les suggestions se relisent avec le solde.
 */
export const creditsQueryKeys = {
  boosts: (page: number, parPage: number) => [...CLE_CREDITS, 'boosts', page, parPage] as const,
  suggestions: (limite: number) => [...CLE_CREDITS, 'suggestions', limite] as const,
  biensEnLigne: (recherche: string) => [...CLE_CREDITS, 'biens-en-ligne', recherche] as const,
  journal: (page: number, parPage: number) => [...CLE_CREDITS, 'journal', page, parPage] as const,
  // TCK-2925 — le rapport des mises en avant et les lots passés.
  rapport: (jours: number) => [...CLE_CREDITS, 'rapport', jours] as const,
  lotsPasses: (page: number, parPage: number) => [...CLE_CREDITS, 'lots-passes', page, parPage] as const,
  // TCK-2525 — la mise en avant de l'agence dans l'annuaire.
  miseEnAvantAgence: () => [...CLE_CREDITS, 'spotlights'] as const,
  devisMiseEnAvantAgence: (ville: number | null, jour: string) => [...CLE_CREDITS, 'spotlights', 'quote', ville, jour] as const,
};

/**
 * L'historique paginé, à SA taille de page : 5 lignes dans la carte du bureau, 20 dans le panneau
 * « Historique ». La taille est dans la clé (deux tailles, deux pages différentes) ; la page
 * précédente reste affichée pendant qu'on lit la suivante.
 */
export function useCreditsJournal(page: number, parPage: number, enabled = true) {
  return useApiQuery<CreditsResponse>(creditsQueryKeys.journal(page, parPage), '/api/credits', {
    enabled,
    params: { page, per_page: parPage },
    placeholderData: keepPreviousData,
  });
}

/** Une mise en avant de l'espace (`CreditBoostResource`). `measures` nul : non mesurée, jamais 0. */
export interface MiseEnAvant {
  readonly id: number;
  readonly kind: BoostKind;
  readonly variant: BoostVariant | null;
  readonly status: BoostStatus;
  readonly price_credits: number;
  /** La durée achetée, cumulée par une prolongation (0 pour une Remontée). */
  readonly duration_days: number;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly ended_at: string | null;
  readonly property: CarteDeBien | null;
  readonly measures: { readonly impressions: number; readonly clicks: number; readonly contacts: number; readonly visits: number } | null;
  /**
   * TCK-2923/TCK-2925 — les vues de la FICHE (`property_daily_views`) sur les 7 derniers jours de la
   * mise en avant (moins de 7 quand elle est plus courte) et sur les 7 jours qui précèdent son début.
   */
  readonly views_7d?: number;
  readonly views_prev_7d?: number;
}

export interface CarteDeBien {
  readonly id: number;
  readonly title: string | null;
  readonly main_photo_url: string | null;
  readonly quarter: string | null;
}

/** Un bien à pousser (`CreditSuggestionResource`) : `last_contact_at` nul, jamais contacté. */
export interface BienAPousser extends CarteDeBien {
  readonly views_count: number;
  readonly last_contact_at: string | null;
}

export function useMisesEnAvant(page: number, parPage: number, enabled = true) {
  return useApiQuery<PaginatedResponse<MiseEnAvant>>(creditsQueryKeys.boosts(page, parPage), '/api/credits/boosts', {
    enabled,
    params: { page, per_page: parPage },
  });
}

export function useBiensAPousser(limite: number, enabled = true) {
  return useApiQuery<{ readonly data: readonly BienAPousser[]; readonly meta: { readonly total: number } }>(
    creditsQueryKeys.suggestions(limite),
    '/api/credits/suggestions',
    { enabled, params: { extra: { limit: String(limite) } } },
  );
}

/** Un bien en ligne de l'espace, tel que le choix d'un bien le montre. */
export interface BienEnLigne {
  readonly id: number;
  readonly title: string | null;
  readonly main_photo_url: string | null;
  readonly views_count?: number;
  readonly location?: { readonly quarter: string | null; readonly city: string | null } | null;
}

export const BIEN_EN_LIGNE_FIELDS = ['id', 'title', 'views_count'] as const;

/**
 * Les biens EN LIGNE de l'espace (`filter[public]=1`, la règle même que l'achat exige), cherchés
 * par titre ou référence côté serveur (`filter[search]`). Sans recherche : le compte seul
 * (« parmi vos 67 biens en ligne ») et la première page.
 */
export function useBiensEnLigne(recherche: string, enabled = true) {
  return useApiQuery<PaginatedResponse<BienEnLigne>>(creditsQueryKeys.biensEnLigne(recherche), '/api/properties', {
    enabled,
    params: {
      fields: { properties: [...BIEN_EN_LIGNE_FIELDS] },
      filter: recherche ? { public: '1', search: recherche } : { public: '1' },
      include: ['address'],
      per_page: 10,
    },
  });
}

/* ───────────────── TCK-2925 — le rapport sur 30 jours et les lots passés ───────────────── */

/** Un jour du rapport (`date` : jour calendaire UTC `AAAA-MM-JJ`) ; 0 sans mesure. */
export interface JourDuRapport {
  readonly date: string;
  readonly impressions: number;
  readonly clicks: number;
  /** Les vues de fiche des biens un jour où l'une de leurs mises en avant courait. */
  readonly views: number;
}

/** Une mise en avant qui a couru dans la période, et ses totaux sur la période. */
export interface MiseEnAvantDuRapport {
  readonly id: number;
  readonly kind: BoostKind;
  readonly variant: BoostVariant | null;
  readonly status: BoostStatus;
  readonly starts_at: string | null;
  readonly ended_at: string | null;
  readonly property: CarteDeBien | null;
  readonly impressions: number;
  readonly clicks: number;
  readonly views: number;
}

export interface RapportDesMisesEnAvant {
  readonly data: { readonly days: readonly JourDuRapport[]; readonly boosts: readonly MiseEnAvantDuRapport[] };
  readonly meta: { readonly days: number; readonly from: string; readonly to: string };
}

/** `GET /api/credits/boosts/report?days=…` (7, 30 ou 90 ; TCK-2924). */
export function useRapportDesMisesEnAvant(jours: 7 | 30 | 90, enabled = true) {
  return useApiQuery<RapportDesMisesEnAvant>(creditsQueryKeys.rapport(jours), '/api/credits/boosts/report', {
    enabled,
    params: { extra: { days: String(jours) } },
  });
}

/** Un lot qu'on ne peut plus dépenser : `spent` (vidé) ou `expired` (échu). */
export interface LotPasse extends CreditLot {
  readonly state: 'spent' | 'expired';
}

export const LOT_PASSE_FIELDS = ['id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at', 'reason', 'created_at'] as const;

/**
 * `GET /api/credits/lots` (TCK-2924) : les lots épuisés ET expirés (sans `filter[state]`, l'API rend
 * les deux), le plus récent d'abord — jamais filtrés côté client.
 */
export function useLotsPasses(page: number, parPage: number, enabled = true) {
  return useApiQuery<PaginatedResponse<LotPasse>>(creditsQueryKeys.lotsPasses(page, parPage), '/api/credits/lots', {
    enabled,
    params: { fields: { credit_lots: [...LOT_PASSE_FIELDS] }, page, per_page: parPage },
    placeholderData: keepPreviousData,
  });
}

/* ───────────── TCK-2525 — la mise en avant de l'agence dans l'annuaire, achetée en crédits ───────────── */

/** Les réglages de la plateforme que l'écran d'achat lit (amendement du 2026-11-16 d'ADR-0061). */
export interface ReglagesMiseEnAvantAgence {
  readonly sale_enabled: boolean;
  readonly price_credits: number;
  readonly duration_days: number;
  readonly max_advance_days: number;
  readonly when_taken: 'refuse' | 'next_free';
  readonly sell_directory_wide: boolean;
}

/** Une place de l'agence, en cours ou à venir. `city` nul : l'annuaire sans ville. */
export interface PlaceDeLAgence {
  readonly id: number;
  readonly geo_city_id: number | null;
  readonly city: { readonly id: number; readonly name: string } | null;
  readonly origin: 'offered' | 'purchased';
  readonly price_credits: number;
  readonly starts_at: string;
  readonly ends_at: string;
}

export interface MiseEnAvantAgenceResponse {
  readonly data: { readonly settings: ReglagesMiseEnAvantAgence; readonly balance: number; readonly spotlights: readonly PlaceDeLAgence[] };
}

/** Le devis : la période réelle (sous `next_free`, le premier créneau libre), le prix, le solde après. */
export interface DevisMiseEnAvantAgence {
  readonly available: boolean;
  readonly reason: 'taken' | 'too_far' | 'no_free_period' | null;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly next_free_at: string | null;
  readonly price_credits: number;
  readonly balance: number;
  readonly balance_after: number;
}

export function useMiseEnAvantAgence(enabled = true) {
  return useApiQuery<MiseEnAvantAgenceResponse>(creditsQueryKeys.miseEnAvantAgence(), '/api/credits/spotlights', { enabled });
}

/** `ville` nul : l'annuaire sans ville ; `jour` vide : tout de suite. Rien n'est demandé sans `enabled`. */
export function useDevisMiseEnAvantAgence(ville: number | null, jour: string, enabled = true) {
  return useApiQuery<{ readonly data: DevisMiseEnAvantAgence }>(creditsQueryKeys.devisMiseEnAvantAgence(ville, jour), '/api/credits/spotlights/quote', {
    enabled,
    params: { extra: { geo_city_id: ville ?? undefined, starts_on: jour || undefined } },
  });
}

/**
 * L'achat. `cleIdempotence` part dans l'en-tête `Idempotency-Key` : un double clic ne paie pas deux
 * places (sous `next_free`, il en paierait deux consécutives). Invalide tout `['credits']` : solde,
 * historique et places se relisent.
 */
export function useAcheterMiseEnAvantAgence(cleIdempotence: string) {
  return useApiMutation<{ readonly data: PlaceDeLAgence; readonly balance: number }, { readonly geo_city_id: number | null; readonly starts_on?: string }>(
    { path: '/api/credits/spotlights', method: 'POST' },
    { invalidate: [[...CLE_CREDITS]], request: { headers: { 'Idempotency-Key': cleIdempotence } } },
  );
}
