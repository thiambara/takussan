'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { bornesDeLOnglet, debutDeLaMinute } from '@/components/visits/onglet-des-visites';
import { useAuth } from '@/context/AuthContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { type ApiError, apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { EquipeDuJour } from '@/lib/accueil/a-faire';
import { parametresDesDemandes, type ContactLead } from '@/lib/queries/contact-leads';
import { usePaymentsHistory, type UsePaymentsHistoryParams } from '@/lib/queries/payments';
import { fetchPropertyModerationQueue } from '@/lib/queries/property-moderation';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import { filtreSpatieDesVisites, VISIT_TIME_FIELDS, visitsQueryKeys, type VisitActionResponse } from '@/lib/queries/visits';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-2624 — les lectures et les gestes de « À faire maintenant » qu'aucun module ne portait. Chaque
 * lecture est la file d'une pastille de la colonne (ADR-0089 § 5), au même filtre, en `per_page`
 * court : le total vient de `meta.total`, les premières lignes de `data`.
 *
 * ⚠ **Les clés vivent SOUS celles des compteurs de la coque** (`['property-moderation']`,
 * `['contact-leads']`, `['visits', 'list']`, `['reviews-moderation']`) : un geste qui invalide la
 * famille relit à la fois la file de l'accueil et la pastille de la colonne. Le compteur des visites,
 * lui, n'est pas sous `['visits', 'list']` (`visitsQueryKeys.pendingCount`) : le geste de
 * confirmation le nomme.
 */
export const accueilQueryKeys = {
  bienAValider: () => ['property-moderation', 'accueil'] as const,
  demandesAAttribuer: () => ['contact-leads', 'accueil', 'a-attribuer'] as const,
  visitesAConfirmer: () => ['visits', 'list', 'accueil', 'a-confirmer'] as const,
  avisAModerer: () => ['reviews-moderation', 'accueil'] as const,
  equipe: (agencyId: number) => ['agencies', agencyId, 'team-today'] as const,
};

/** Le plus ancien bien en attente de validation, et le compte de la file (`/app/agency/moderation/properties`). */
export function useBienAValider(enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: accueilQueryKeys.bienAValider(),
    queryFn: () => fetchPropertyModerationQueue(token ?? '', { perPage: 1 }),
    enabled: enabled && Boolean(token),
  });
}

/** Les demandes à attribuer (`filter[unassigned]=1`, TCK-2583), les plus anciennes d'abord. */
export function useDemandesAAttribuer(enabled: boolean) {
  return useApiQuery<PaginatedResponse<ContactLead>>(accueilQueryKeys.demandesAAttribuer(), '/api/contact-leads', {
    params: { ...parametresDesDemandes('unassigned', 1), per_page: 3 },
    enabled,
  });
}

/**
 * Les visites à confirmer : le filtre de la pastille « Visites à confirmer »
 * (`parametresDuCompteDesVisitesEnAttente`) — le compte de la carte est celui de la colonne —, avec
 * les colonnes d'une rangée et les deux plus proches.
 */
export function parametresDesVisitesAConfirmer(maintenant: Date): SpatieQueryParams {
  return {
    fields: {
      property_visits: VISIT_TIME_FIELDS,
      properties: ['id', 'title', 'slug'],
      users: ['id', 'first_name', 'last_name'],
      customers: ['id', 'first_name', 'last_name', 'phone'],
    },
    filter: filtreSpatieDesVisites(bornesDeLOnglet('requested', debutDeLaMinute(maintenant))),
    include: ['property', 'agent', 'visitor', 'customer'],
    sort: ['scheduled_at'],
    page: 1,
    per_page: 2,
  };
}

/**
 * ⚠ L'instant se prend À CHAQUE LECTURE, dans la `queryFn` (comme `usePendingVisitsCount`) : borné
 * à la minute dans la CLÉ, la clé changerait chaque minute et le bloc repasserait en squelette.
 */
export function useVisitesAConfirmer(enabled: boolean) {
  const locale = useLocale();
  const { token } = useAuth();
  return useQuery<PaginatedResponse<PropertyVisit>, ApiError>({
    queryKey: accueilQueryKeys.visitesAConfirmer(),
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<PropertyVisit>>(cheminApi`/api/property-visits${requete(buildQueryString(parametresDesVisitesAConfirmer(new Date())))}`, {
        token: token ?? undefined,
        locale,
        signal,
      }),
    enabled: enabled && Boolean(token),
  });
}

/** Le plus ancien avis en attente, et le compte de la file — le filtre de la pastille (`COMPTE_DES_AVIS_EN_ATTENTE`). */
export function useAvisAModerer(enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: accueilQueryKeys.avisAModerer(),
    queryFn: () => fetchModerationQueue(token ?? '', { status: 'pending', sort: 'created_at', perPage: 1 }),
    enabled: enabled && Boolean(token),
  });
}

/** « Équipe aujourd'hui » (TCK-2623) : `reports.view_agency`, agence `standard` seulement. */
export function useEquipeDuJour(agencyId: number, enabled: boolean) {
  return useApiQuery<ApiResponse<EquipeDuJour>>(accueilQueryKeys.equipe(agencyId), cheminApi`/api/agencies/${agencyId}/team-today`, {
    enabled,
    staleTime: 60_000,
  });
}

/* ─────────────────────────────────────────── Impayés ─────────────────────────────────────────── */

/**
 * Les échéances impayées telles que les lit l'écran Impayés (TCK-2660) : la règle *Impayé* partagée
 * (`days_late_min ≥ 1`), le plus en retard d'abord, nommées (`payer`, `property`, `reminders`).
 */
const ECHEANCES_EN_RETARD = {
  days_late_min: 1,
  sort: '-days_late',
  include: ['payer', 'property', 'landlord', 'reminders'],
} as const satisfies UsePaymentsHistoryParams;

/** L'échéance la plus en retard : la rangée d'exemple sous le total des impayés. */
export function useEcheanceLaPlusEnRetard(enabled: boolean) {
  return usePaymentsHistory({ ...ECHEANCES_EN_RETARD, page: 1, per_page: 1, enabled });
}

// TCK-2775 — « Relancer tout » lisait ici les échéances à relancer : la lecture vit désormais avec
// l'écran Impayés (`components/admin/finances/impayes/lire-les-echeances.ts`), qui ouvre la relance.

/* ─────────────────────────────────────────── Gestes ─────────────────────────────────────────── */

/**
 * « Valider » un bien depuis l'accueil : l'approbation de la modération, sous la garde du second
 * facteur que `useApiMutation` pose (la même que `PropertyModerationDetail`). La famille
 * `['property-moderation']` est relue : la file de l'accueil ET la pastille « Biens à valider ».
 */
export function useValiderLeBien() {
  return useApiMutation<unknown, { readonly id: number }>(
    { path: ({ id }) => cheminApi`/api/properties/${id}/approve`, method: 'POST', body: () => ({}) },
    { invalidate: [['property-moderation']] },
  );
}

/**
 * « Confirmer » une visite depuis l'accueil, à l'heure fixée ou à l'heure choisie dans sa tranche
 * (`scheduled_at`). Relit les listes de visites ET la pastille « Visites à confirmer ».
 */
export function useConfirmerDepuisLAccueil() {
  return useApiMutation<VisitActionResponse, { readonly id: number; readonly scheduled_at?: string }>(
    {
      path: ({ id }) => cheminApi`/api/property-visits/${id}/confirm`,
      method: 'POST',
      body: ({ scheduled_at }) => (scheduled_at ? { scheduled_at } : {}),
    },
    { invalidate: [['visits', 'list'], ['visits', 'detail'], visitsQueryKeys.pendingCount()] },
  );
}
