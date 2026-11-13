'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { nomAffichable } from '@/lib/identite';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { Lease, LeaseStatus, LeaseType } from '@/types/lease';
import type { TenantOnboardingChecklist } from '@/types/tenant-onboarding';

/**
 * TCK-2644 — la liste des baux de l'agence : la file « À traiter », ses onglets comptés et la
 * recherche, sur l'API de TCK-2642 (`GET /api/leases` + `GET /api/leases/summary`).
 *
 * Les règles de la file sont calculées par l'API (`App\Services\Lease\LeaseAttention`) ; le front
 * ne les recalcule jamais, il lit `attention[]` (du plus grave au plus ancien) et les comptes.
 */

/** Les huit motifs de `LeaseAttention::MOTIFS`, dans leur ordre. */
export const MOTIFS_D_ATTENTION = [
  'signature_pending',
  'notice_received',
  'rent_late',
  'late_fee_unpaid',
  'rent_review_open',
  'deposit_to_refund',
  'ending_soon',
  'onboarding_incomplete',
] as const;

export type MotifDAttention = (typeof MOTIFS_D_ATTENTION)[number];

/** Une entrée de `attention[]` : `amount` et `due_date` selon le motif (montant : une SOMME). */
export interface EntreeDAttention {
  readonly motif: MotifDAttention;
  readonly since: string;
  readonly amount?: number;
  readonly due_date?: string;
}

/** Une ligne de la liste : le bail, ses parties nommées et son bloc d'attention (`include=…`). */
export type BailDeLaListe = Lease & {
  readonly agent_id?: number | null;
  readonly tenant?: {
    readonly id: number;
    readonly first_name: string | null;
    readonly last_name: string | null;
    readonly phone?: string | null;
    readonly locale?: string | null;
  } | null;
  readonly property?: { readonly id: number; readonly title: string | null; readonly reference_number?: string | null } | null;
  readonly agent?: { readonly id: number; readonly full_name: string | null; readonly first_name?: string | null; readonly last_name?: string | null } | null;
  readonly attention?: readonly EntreeDAttention[];
  readonly overdue_count?: number;
  readonly overdue_amount?: number;
};

/** Les onglets de l'agence, et la clé de `summary` qui compte chacun. */
export const ONGLETS_DES_BAUX = ['a_traiter', 'actifs', 'en_attente', 'termines'] as const;
export type OngletDesBaux = (typeof ONGLETS_DES_BAUX)[number];

export const COMPTE_DE_L_ONGLET: Readonly<Record<OngletDesBaux, 'a_traiter' | 'active' | 'onboarding_pending' | 'ended'>> = {
  a_traiter: 'a_traiter',
  actifs: 'active',
  en_attente: 'onboarding_pending',
  termines: 'ended',
};

/** Les statuts que `LeaseSummaryController` met derrière `active` et `ended`. */
const STATUTS_ACTIFS = 'active,terminating';
const STATUTS_TERMINES = 'expired,terminated,renewed';

export interface ResumeDesBaux {
  readonly a_traiter: number;
  readonly active: number;
  readonly onboarding_pending: number;
  readonly ended: number;
  readonly draft: number;
  readonly motifs: Readonly<Record<MotifDAttention, number>>;
}

/** Les filtres qui portent sur TOUS les onglets — et donc sur les comptes. */
export interface FiltresCommuns {
  readonly search: string | null;
  readonly propertyId: number | null;
  readonly type: LeaseType | null;
  /** L'agent du bail (`filter[agent_id]`, que l'index et le résumé acceptent tous deux). */
  readonly agentId: number | null;
}

function filtresCommuns(f: FiltresCommuns): Record<string, string | number> {
  const filter: Record<string, string | number> = {};
  if (f.search) filter.search = f.search;
  if (f.propertyId) filter.property_id = f.propertyId;
  if (f.type) filter.type = f.type;
  if (f.agentId) filter.agent_id = f.agentId;
  return filter;
}

/** Un agent de l'agence, pour le filtre « Agent » : l'identifiant et le nom affichable, rien d'autre. */
export interface AgentDuFiltre {
  readonly id: number;
  readonly nom: string;
}

/**
 * Les agents de l'agence (`GET /api/agencies/{agency}/members?filter[role]=agent`), pour le filtre
 * « Agent » de la liste. Ni e-mail ni numéro : le nom seul (P220.05). Une lecture refusée laisse la
 * liste sans ce filtre — elle ne l'empêche pas de s'afficher.
 */
export function useAgentsDeLAgence(agencyId: number | null): { readonly agents: readonly AgentDuFiltre[] | null } {
  const lu = useApiQuery<PaginatedResponse<{ id: number; first_name: string | null; last_name: string | null }>>(
    ['agencies', agencyId, 'members', 'agents-du-filtre-des-baux'],
    cheminApi`/api/agencies/${agencyId ?? 0}/members`,
    {
      params: { filter: { role: 'agent' }, fields: { users: ['id', 'first_name', 'last_name'] }, per_page: 100 },
      enabled: agencyId !== null,
    },
  );
  return { agents: lu.data ? lu.data.data.map((u) => ({ id: u.id, nom: nomAffichable(u) })) : null };
}

/** `GET /api/leases/summary` : les comptes des onglets, en UN appel (AC2), sous les filtres communs. */
export function useResumeDesBaux(filtres: FiltresCommuns, enabled = true) {
  return useApiQuery<ApiResponse<ResumeDesBaux>>(['leases', 'summary', filtres], '/api/leases/summary', {
    params: { filter: filtresCommuns(filtres) },
    enabled,
  });
}

/** Ce que la liste lit : l'onglet, OU un statut choisi (`?status=` — les brouillons s'y trouvent). */
export type PortionDesBaux = { readonly onglet: OngletDesBaux; readonly motif?: MotifDAttention | null } | { readonly statut: LeaseStatus };

const CHAMPS_DE_LA_LISTE = [
  'id',
  'reference_number',
  'type',
  'status',
  'start_date',
  'end_date',
  'monthly_rent',
  'sale_price',
  'currency',
  'signed_at',
  'early_termination_effective_date',
  'property_id',
  'tenant_id',
  'landlord_id',
  'agent_id',
  'created_at',
];

export function filtresDeLaPortion(portion: PortionDesBaux, communs: FiltresCommuns): Record<string, string | number> {
  const filter = filtresCommuns(communs);
  if ('statut' in portion) {
    filter.status = portion.statut;
    return filter;
  }
  if (portion.onglet === 'a_traiter') {
    filter.a_traiter = 1;
    if (portion.motif) filter.motif = portion.motif;
  } else if (portion.onglet === 'actifs') filter.status = STATUTS_ACTIFS;
  else if (portion.onglet === 'en_attente') filter.onboarding_pending = 1;
  else filter.status = STATUTS_TERMINES;
  return filter;
}

/**
 * Une page de la liste de l'agence. La file se trie par `attention` (le plus grave, puis le plus
 * ancien) ; les autres portions par `etat` (en cours d'abord), le tri par défaut de l'API.
 */
export function useBauxDeLAgence(portion: PortionDesBaux, communs: FiltresCommuns, page: number) {
  const file = !('statut' in portion) && portion.onglet === 'a_traiter';
  const params: SpatieQueryParams = {
    fields: { leases: CHAMPS_DE_LA_LISTE, properties: ['id', 'title', 'reference_number'] },
    filter: filtresDeLaPortion(portion, communs),
    include: ['tenant', 'property', 'agent', 'attention', 'due_summary'],
    sort: [file ? 'attention' : 'etat'],
    page,
    per_page: 30,
  };
  return useApiQuery<PaginatedResponse<BailDeLaListe>>(['leases', 'list', 'agence', portion, communs, page], '/api/leases', { params });
}

/** Le bailleur et le locataire : leurs baux, avec le nom du locataire, sans file ni geste d'agence. */
export function useBauxDuLecteur(page: number, statut: LeaseStatus | null) {
  const params: SpatieQueryParams = {
    fields: { leases: CHAMPS_DE_LA_LISTE, properties: ['id', 'title', 'reference_number'] },
    filter: statut ? { status: statut } : {},
    include: ['tenant', 'property'],
    sort: ['etat'],
    page,
    per_page: 30,
  };
  return useApiQuery<PaginatedResponse<BailDeLaListe>>(['leases', 'list', 'lecteur', statut, page], '/api/leases', { params });
}

/** Les éléments de la liste d'entrée, dans l'ordre de l'ancien écran (TCK-266). */
export const ELEMENTS_D_ENTREE = ['welcome_seen_at', 'inventory_completed_at', 'first_payment_at', 'documents_acknowledged_at'] as const;
export type ElementDEntree = (typeof ELEMENTS_D_ENTREE)[number];

/**
 * Les listes d'entrée des baux de la page (onglet « En attente du locataire ») : ce qui manque à
 * chacun, que la ligne du bail ne porte pas. `filter[lease_id]` sur l'endpoint de TCK-266.
 */
export function useListesDEntree(agencyId: number | null | undefined, leaseIds: readonly number[]) {
  const ids = [...leaseIds].sort((a, b) => a - b);
  return useApiQuery<PaginatedResponse<TenantOnboardingChecklist>>(
    ['tenant-onboarding', 'agency-pending', agencyId, 'baux', ids],
    cheminApi`/api/agencies/${agencyId ?? 0}/tenant-onboarding-pending`,
    {
      params: {
        fields: { tenant_onboarding_checklists: ['id', 'lease_id', 'created_at', ...ELEMENTS_D_ENTREE] },
        filter: { lease_id: ids.join(',') },
        per_page: 100,
      },
      enabled: Boolean(agencyId) && ids.length > 0,
    },
  );
}

/** Ce qui manque à une liste d'entrée : les éléments encore vides. */
export function elementsManquants(liste: Pick<TenantOnboardingChecklist, ElementDEntree> | undefined): ElementDEntree[] {
  if (!liste) return [];
  return ELEMENTS_D_ENTREE.filter((e) => liste[e] == null);
}
