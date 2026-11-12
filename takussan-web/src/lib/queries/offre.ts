import { cache } from 'react';

import { ApiError, apiRequest } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { AGENCY_SUBSCRIPTION_FIELDS } from '@/lib/queries/billing';
import type { ApiResponse } from '@/types/api';
import type { OffreDePassage } from '@/types/agency-upgrade';
import type { AgencySubscription, AgencySubscriptionResponse } from '@/types/super-admin';

/**
 * TCK-2671 — ce que l'agence paie et ce qu'elle consomme, lu au rendu serveur (jeton explicite,
 * module sans directive : les pages RSC l'appellent). Le prix vient TOUJOURS de l'API — décision
 * 14 : aucun montant ne s'écrit dans le code.
 */

/** Une jauge : `limit: null` = illimité. */
export interface Jauge {
  readonly limit: number | null;
  readonly used: number;
}

/**
 * `GET /api/me/quota` (TCK-627, TCK-2669) : les clés plates sont les annonces actives, `agents` est
 * `null` pour qui n'est pas du personnel de l'agence (un bailleur).
 */
export interface QuotaDeLAgence {
  readonly biens: Jauge;
  readonly agents: Jauge | null;
}

interface QuotaBrut {
  readonly limit: number | null;
  readonly used: number;
  readonly agents?: Jauge | null;
}

export const fetchQuotaDeLAgence = cache(async (token: string): Promise<QuotaDeLAgence> => {
  const res = await apiRequest<ApiResponse<QuotaBrut>>('/api/me/quota', { token });
  return { biens: { limit: res.data.limit, used: res.data.used }, agents: res.data.agents ?? null };
});

/**
 * `GET /api/me/upgrade-offer` (TCK-2669). `null` quand l'offre n'existe pas (404
 * `plan.upgrade_offer_missing`, ou pas d'espace actif) : l'écran le dit au lieu d'inventer un prix.
 * Toute autre erreur remonte — l'appelant choisit d'afficher un état d'erreur.
 */
export const fetchOffreDePassage = cache(async (token: string): Promise<OffreDePassage | null> => {
  try {
    const res = await apiRequest<ApiResponse<OffreDePassage>>('/api/me/upgrade-offer', { token });
    return res.data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
});

/** `GET /api/me/subscription?include=plan` — l'abonnement de l'agence active, `null` sans abonnement. */
export const fetchAbonnement = cache(async (token: string): Promise<AgencySubscription | null> => {
  const qs = new URLSearchParams({ 'fields[agency_subscriptions]': AGENCY_SUBSCRIPTION_FIELDS, include: 'plan' });
  const res = await apiRequest<AgencySubscriptionResponse>(cheminApi`/api/me/subscription${requete(qs)}`, { token });
  return res.data;
});
