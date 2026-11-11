'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { type ApiError, apiRequest, buildQueryString } from '@/lib/api';
import { bornesDeLOnglet, debutDeLaMinute } from '@/components/visits/onglet-des-visites';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type {
  PropertyVisit,
  VisitFeedbackPayload,
  VisitStatus,
  VisitType,
} from '@/types/visit';
import type { SortDuSms } from '@/lib/visites/sort-du-sms';
import type { CreneauDuServeur } from '@/lib/visites/planification';
import { cheminApi } from '@/lib/chemin-api';
import type { CorpsDuCompteRendu, VisiteAvecCompteRendu } from '@/lib/visites/compte-rendu';

/**
 * TCK-075 — React Query hooks for `/api/property-visits`.
 *
 * Following the project-wide spatie conventions (CLAUDE.md → "API —
 * Conventions frontend"): every list/detail request uses
 * `fields[property_visits]`, declares its includes explicitly, and
 * pushes filtering to the backend rather than the client.
 */

export const VISIT_LIST_FIELDS: string[] = [
  'id',
  'property_id',
  'visitor_id',
  'agent_id',
  'type',
  'status',
  'scheduled_at',
  'completed_at',
  'duration_minutes',
  'created_at',
];

export type UseVisitsParams = {
  status?: VisitStatus;
  type?: VisitType;
  property_id?: number;
  /** ISO date-time. */
  scheduled_at_min?: string;
  /** ISO date-time. */
  scheduled_at_max?: string;
  page?: number;
  per_page?: number;
  sort?: string;
  /** TCK-590 — les visites qu'aucun agent n'a encore prises en charge (`filter[unassigned]`). */
  unassigned?: boolean;
};

export const visitsQueryKeys = {
  list: (params: UseVisitsParams) => ['visits', 'list', params] as const,
  detail: (id: number | null | undefined) => ['visits', 'detail', id] as const,
  /** TCK-377 — compteur du menu. Clé distincte de `list` : ce n'est pas une page de liste. */
  pendingCount: () => ['visits', 'pending-count'] as const,
};

/**
 * TCK-377 — Nombre de demandes de visite EN ATTENTE, pour la pastille de la barre latérale.
 *
 * ⚠ Trois points où le ticket décrivait une API qui n'existe pas, mesurés le 2026-08-27 :
 *
 *  1. l'endpoint est `/api/property-visits`, pas `/api/visits` (`routes/api/property-visits.php`) ;
 *  2. il n'existe **aucun** statut `pending`. `App\Models\Enums\VisitStatus` en compte cinq —
 *     `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show` — et « en attente » est
 *     `scheduled`, que le front affiche déjà « Demandée » (`visits.status.scheduled`) ;
 *  3. le compte se lit dans `meta.total`, pas dans `meta.pending_count`. Ce dernier n'existe que
 *     sur les deux files de modération que la section d'agence d'`AppSidebar` sonde — c'est un champ que ces
 *     contrôleurs ajoutent, pas une propriété de l'enveloppe paginée.
 *
 * TCK-2479 (revue, I2) — le filtre est le PÉRIMÈTRE de l'onglet « Demandées », où mène la pastille
 * (`bornesDeLOnglet('requested', …)`) : `scheduled` ET à venir. Sans la borne de date, une demande
 * d'hier jamais confirmée restait comptée pour toujours, rangée par la page dans « Passées ».
 *
 * `per_page: 1` et `fields[property_visits]=id` : on ne veut que l'en-tête de pagination, jamais
 * la page. La cadence de 60 s est celle de ces deux files — un menu n'est pas un cron.
 */
export function parametresDuCompteDesVisitesEnAttente(maintenant: Date): SpatieQueryParams {
  return {
    fields: { property_visits: ['id'] },
    filter: filtreSpatieDesVisites(bornesDeLOnglet('requested', debutDeLaMinute(maintenant))),
    page: 1,
    per_page: 1,
  };
}

export function usePendingVisitsCount(options: { enabled?: boolean } = {}) {
  const locale = useLocale();
  const { token } = useAuth();
  return useQuery<PaginatedResponse<PropertyVisit>, ApiError>({
    queryKey: visitsQueryKeys.pendingCount(),
    // L'instant se prend À CHAQUE LECTURE, pas au rendu : la barre ne se re-rend pas toutes les
    // minutes, et une borne figée au rendu recompterait les visites passées depuis.
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<PropertyVisit>>(
        cheminApi`/api/property-visits?${buildQueryString(parametresDuCompteDesVisitesEnAttente(new Date()))}`,
        { token: token ?? undefined, locale, signal },
      ),
    enabled: options.enabled ?? true,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Le `filter[...]` d'une lecture de `/api/property-visits` — celui de `useVisits` et du compteur. */
export function filtreSpatieDesVisites(params: UseVisitsParams): Record<string, string> {
  const { status, type, property_id, scheduled_at_min, scheduled_at_max, unassigned } = params;
  return {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(property_id ? { property_id: String(property_id) } : {}),
    ...(scheduled_at_min ? { scheduled_at_min } : {}),
    ...(scheduled_at_max ? { scheduled_at_max } : {}),
    ...(unassigned ? { unassigned: '1' } : {}),
  };
}

export function useVisits(params: UseVisitsParams = {}) {
  const { page, per_page, sort } = params;

  const spatieParams: SpatieQueryParams = {
    fields: {
      property_visits: VISIT_LIST_FIELDS,
      // `main_photo_url` is a computed attribute (Spatie media library), not a
      // DB column, so it must NOT appear in `fields[properties]`. The API
      // resource emits it unconditionally, so it's still present in the response.
      properties: ['id', 'title', 'slug'],
      users: ['id', 'first_name', 'last_name'],
    },
    filter: filtreSpatieDesVisites(params),
    include: ['property', 'agent', 'visitor'],
    sort: [sort ?? 'scheduled_at'],
    page: page ?? 1,
    per_page: per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<PropertyVisit>>(
    visitsQueryKeys.list(params),
    '/api/property-visits',
    { params: spatieParams },
  );
}

export function useVisit(id: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    include: ['property', 'agent', 'visitor', 'customer'],
  };

  return useApiQuery<ApiResponse<PropertyVisit>>(
    visitsQueryKeys.detail(id),
    cheminApi`/api/property-visits/${id ?? 0}`,
    {
      params: spatieParams,
      enabled: Boolean(id),
    },
  );
}

/**
 * TCK-590 (passe 3, R1) — les actions de l'agence qui préviennent le visiteur rendent aussi le
 * sort du SMS ({@link SortDuSms}).
 */
export type VisitActionResponse = ApiResponse<PropertyVisit> & SortDuSms;

export function useConfirmVisit(id: number) {
  return useApiMutation<VisitActionResponse, void>(
    { path: cheminApi`/api/property-visits/${id}/confirm`, method: 'POST' },
    {
      relireSurErreur: true,
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useCompleteVisit(id: number) {
  return useApiMutation<
    ApiResponse<PropertyVisit>,
    { feedback?: string; rating?: number }
  >(
    { path: cheminApi`/api/property-visits/${id}/complete`, method: 'POST' },
    {
      relireSurErreur: true,
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

/**
 * TCK-1375 (P115.05) — le visiteur n'est pas venu : la visite passée est marquée absente
 * (`no_show`), sans être comptée parmi les visites menées.
 */
export function useMarkVisitNoShow(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, void>(
    { path: cheminApi`/api/property-visits/${id}/no-show`, method: 'POST' },
    {
      relireSurErreur: true,
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useCancelVisit(id: number) {
  return useApiMutation<VisitActionResponse, { reason?: string }>(
    { path: cheminApi`/api/property-visits/${id}/cancel`, method: 'POST' },
    {
      relireSurErreur: true,
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useUpdateVisit(id: number) {
  return useApiMutation<
    VisitActionResponse,
    { scheduled_at?: string; duration_minutes?: number; notes?: string }
  >(
    { path: cheminApi`/api/property-visits/${id}`, method: 'PATCH' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useSubmitVisitFeedback(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, VisitFeedbackPayload>(
    { path: cheminApi`/api/property-visits/${id}/feedback`, method: 'POST' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

/**
 * TCK-590 — « Prendre en charge » : l'appelant, personnel de l'agence du bien, devient l'agent de
 * la visite. 409 si un collègue l'a déjà prise (sauf `crm.assign`).
 */
export function useClaimVisit(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, void>(
    { path: cheminApi`/api/property-visits/${id}/claim`, method: 'POST', body: () => ({}) },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

/**
 * TCK-590 — le VISITEUR propose un autre créneau : la visite repasse en attente de confirmation
 * et l'agence est prévenue. L'heure est construite à Dakar par l'appelant.
 */
export function useProposeVisitSlot(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, { scheduled_at: string }>(
    { path: cheminApi`/api/property-visits/${id}/reschedule`, method: 'POST' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

/**
 * TCK-590 — le personnel planifie une visite pour un client (ou un prospect : nom + téléphone).
 * Elle naît confirmée, et le client est prévenu.
 */
export interface PlanVisitPayload {
  property_id: number;
  scheduled_at: string;
  customer_id?: number;
  visitor_name?: string;
  visitor_phone?: string;
  /** TCK-2586 — `in_person` par défaut côté serveur. */
  type?: 'in_person' | 'virtual' | 'self_guided' | 'hybrid';
  notes?: string;
  /** TCK-2582 — la visite qui naît d'une demande : la demande passe en « traitée ». */
  contact_lead_id?: number;
  /** TCK-2582 — avec `contact_lead_id` : la fiche client naît de la demande et en garde le message. */
  create_customer?: boolean;
  /** TCK-2586 — la fiche naît malgré une fiche voisine (409 `customer.duplicate` d'abord). */
  allow_duplicate?: boolean;
}

export function usePlanVisit() {
  return useApiMutation<VisitActionResponse, PlanVisitPayload>(
    { path: '/api/property-visits', method: 'POST' },
    // TCK-2586 — la demande traitée et la fiche née d'elle bougent aussi.
    { invalidate: [['visits'], ['calendar'], ['contact-leads'], ['customers']] },
  );
}

/**
 * TCK-2586 (TCK-2585) — les créneaux d'un jour pour un bien, et pour l'agent qui planifie :
 * `GET /api/property-visits/slots?property_id=&date=`. Grille de Dakar, 09:00 → 18:30 par 30 min.
 */
export interface ReponseDesCreneaux {
  readonly data: {
    readonly date: string;
    readonly timezone: string;
    readonly slots: readonly CreneauDuServeur[];
  };
}

export function useCreneauxDeVisite(propertyId: number | null, jour: string | null) {
  return useApiQuery<ReponseDesCreneaux>(['visits', 'slots', propertyId, jour], '/api/property-visits/slots', {
    params: { extra: { property_id: propertyId, date: jour } },
    enabled: propertyId !== null && jour !== null,
    // Un créneau pris par un collègue pendant la saisie : relu à chaque ouverture.
    staleTime: 0,
  });
}

/**
 * TCK-2581 (TCK-2578, ADR-0101) — le compte rendu de la visite : `POST` le crée, `PATCH` le modifie
 * (« Modifier », la suite choisie). La réponse porte la visite, la note recopiée dans la fiche et
 * l'étape proposée (`suggested_stage`, jamais écrite).
 */
export interface ReponseDuCompteRendu {
  readonly data: VisiteAvecCompteRendu;
  readonly customer_note: { readonly id: number; readonly customer_id: number } | null;
  readonly suggested_stage: { readonly from: string; readonly to: string } | null;
}

const INVALIDE_LA_VISITE = (id: number) => [
  ['visits', 'list'],
  ['visits', 'detail', id],
  // La note recopiée et le dernier contact de la fiche avancent (TCK-2583).
  ['customers'],
];

export function useCreateVisitReport(id: number) {
  return useApiMutation<ReponseDuCompteRendu, CorpsDuCompteRendu>(
    { path: cheminApi`/api/property-visits/${id}/report`, method: 'POST' },
    { invalidate: INVALIDE_LA_VISITE(id) },
  );
}

export function useUpdateVisitReport(id: number) {
  return useApiMutation<ReponseDuCompteRendu, CorpsDuCompteRendu>(
    { path: cheminApi`/api/property-visits/${id}/report`, method: 'PATCH' },
    { invalidate: INVALIDE_LA_VISITE(id) },
  );
}

/* ─────────────────────────── TCK-2587 — les Visites par le temps ─────────────────────────── */

/** Les colonnes d'une carte « par le temps » : l'heure, la tranche, le visiteur et son mot. */
export const VISIT_TIME_FIELDS: string[] = [
  'id',
  'property_id',
  'visitor_id',
  'customer_id',
  'agent_id',
  'visitor_name',
  'visitor_phone',
  'type',
  'status',
  'scheduled_at',
  'preferred_window',
  'completed_at',
  'duration_minutes',
  'notes',
  'created_at',
];

/** Les affinages du bureau, communs à la liste et aux comptes (`filter[...]`). */
export interface AffinageDesVisites {
  readonly agent?: number | null;
  readonly bien?: number | null;
  readonly q?: string | null;
  /** La période du bureau : jusqu'à cet instant (`filter[scheduled_at_max]`). */
  readonly jusquA?: string | null;
}

export function filtreDeLAffinage(a: AffinageDesVisites): Record<string, string> {
  return {
    ...(a.agent ? { agent_id: String(a.agent) } : {}),
    ...(a.bien ? { property_id: String(a.bien) } : {}),
    ...(a.q?.trim() ? { search: a.q.trim() } : {}),
    ...(a.jusquA ? { scheduled_at_max: a.jusquA } : {}),
  };
}

/**
 * Les comptes de toutes les vues, en UNE requête (`GET /api/property-visits/counts`, TCK-2585) :
 * AC2 de TCK-2587 — la page n'émet plus une lecture par onglet. La clé vit SOUS `['visits', 'list']`
 * pour que chaque geste qui relit les listes (confirmer, clore, attribuer…) relise aussi les comptes.
 */
export function useComptesDesVisites(affinage: AffinageDesVisites = {}, options: { enabled?: boolean } = {}) {
  const filtre = filtreDeLAffinage(affinage);
  return useApiQuery<ApiResponse<import('@/lib/visites/par-le-temps').ComptesDesVisites>>(
    ['visits', 'list', 'counts', filtre],
    '/api/property-visits/counts',
    { params: { filter: filtre }, enabled: options.enabled ?? true },
  );
}

/** Une page d'une vue par le temps : la borne de la vue, puis les affinages du bureau. */
export function useVisitesDeLaVue(
  filtreDeVue: Record<string, string>,
  tri: string,
  affinage: AffinageDesVisites = {},
  page = 1,
  perPage = 30,
  options: { enabled?: boolean } = {},
) {
  const filter = { ...filtreDeVue, ...filtreDeLAffinage(affinage) };
  return useApiQuery<PaginatedResponse<PropertyVisit>>(
    ['visits', 'list', 'par-le-temps', filter, tri, page, perPage],
    '/api/property-visits',
    {
      params: {
        fields: {
          property_visits: VISIT_TIME_FIELDS,
          properties: ['id', 'title', 'slug'],
          users: ['id', 'first_name', 'last_name'],
          customers: ['id', 'first_name', 'last_name', 'phone'],
        },
        filter,
        include: ['property', 'agent', 'visitor', 'customer'],
        sort: [tri],
        page,
        per_page: perPage,
      },
      enabled: options.enabled ?? true,
    },
  );
}

/** Confirmer depuis la liste : l'heure fixée pour une tranche (`scheduled_at`), sinon rien. */
export function useConfirmerDepuisLaListe() {
  return useApiMutation<VisitActionResponse, { readonly id: number; readonly scheduled_at?: string }>(
    {
      path: ({ id }) => cheminApi`/api/property-visits/${id}/confirm`,
      method: 'POST',
      body: ({ scheduled_at }) => (scheduled_at ? { scheduled_at } : {}),
    },
    { invalidate: [['visits', 'list'], ['visits', 'detail']] },
  );
}

/** Une ligne d'un lot (`bulk-confirm`, `bulk-assign`) : le geste unitaire, son refus codé sinon. */
export interface LigneDuLot {
  readonly id: number;
  readonly ok: boolean;
  readonly code?: string;
  readonly status?: number;
  readonly sms_sent?: boolean;
}

export interface ReponseDuLot {
  readonly data: readonly LigneDuLot[];
  readonly meta: { readonly ok: number; readonly failed: number };
}

export function useConfirmerEnLot() {
  return useApiMutation<ReponseDuLot, { readonly visits: readonly { readonly id: number; readonly scheduled_at?: string }[] }>(
    { path: '/api/property-visits/bulk-confirm', method: 'POST' },
    { invalidate: [['visits', 'list'], ['visits', 'detail']] },
  );
}

export function useAttribuerEnLot() {
  return useApiMutation<ReponseDuLot, { readonly ids: readonly number[]; readonly agent_id: number }>(
    { path: '/api/property-visits/bulk-assign', method: 'POST' },
    { invalidate: [['visits', 'list'], ['visits', 'detail']] },
  );
}

/** Le verdict posé depuis la carte « À clore » : le compte rendu naît avec lui (TCK-2578). */
export function useVerdictDepuisLaListe() {
  return useApiMutation<ReponseDuCompteRendu, { readonly id: number; readonly outcome: import('@/lib/visites/compte-rendu').Verdict }>(
    { path: ({ id }) => cheminApi`/api/property-visits/${id}/report`, method: 'POST', body: ({ outcome }) => ({ outcome }) },
    { invalidate: [['visits', 'list'], ['visits', 'detail'], ['customers']] },
  );
}

/** « n'est pas venu » depuis la carte « À clore ». */
export function useAbsentDepuisLaListe() {
  return useApiMutation<ApiResponse<PropertyVisit>, { readonly id: number }>(
    { path: ({ id }) => cheminApi`/api/property-visits/${id}/no-show`, method: 'POST', body: () => ({}) },
    { invalidate: [['visits', 'list'], ['visits', 'detail']] },
  );
}
