import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerPipelineStage } from '@/types/customer';

/**
 * TCK-2589 — le fil d'une fiche client : `GET /api/customers/{id}/timeline`. L'API mêle notes,
 * visites, gestes de contact, changements d'étape, et (vérification C/C2, d1 a) la vie de la fiche
 * et de ses tâches, que l'onglet « Activité » retiré portait seul ; elle les trie (instant, puis type, puis id) et les
 * pagine : le front ne trie rien et ne filtre rien lui-même — `filter[type]` part au serveur.
 *
 * Ce qu'un lecteur reçoit est jugé par l'API (`CustomerTimeline`) : les visites et les gestes de
 * contact au seul personnel de l'agence de la fiche, le compte rendu détaillé au personnel.
 */

/** Les types du fil (`CustomerTimeline::TYPES`). */
export const TYPES_DU_FIL = ['note', 'visit', 'contact', 'stage', 'record', 'task'] as const;
export type TypeDuFil = (typeof TYPES_DU_FIL)[number];

/** Une entrée par page : la taille d'une page du fil. */
export const ENTREES_PAR_PAGE = 20;

export interface PersonneDuFil {
  readonly id: number;
  readonly name: string;
}

export interface CompteRenduDuFil {
  readonly visit_id: number;
  readonly outcome: string | null;
  readonly objections: readonly string[];
  readonly follow_up: string | null;
}

export interface NoteDuFil {
  readonly type: 'note';
  readonly id: number;
  readonly at: string;
  readonly kind: string | null;
  readonly body: string | null;
  readonly pinned: boolean;
  readonly property_visit_id: number | null;
  readonly author: PersonneDuFil | null;
  readonly report?: CompteRenduDuFil;
}

/** Un jalon de visite : sa demande, sa confirmation ou son annulation (7a). */
export type JalonDeVisite = 'created' | 'confirmed' | 'cancelled';

export interface VisiteDuFil {
  readonly type: 'visit';
  readonly id: number;
  /** L'instant du jalon. */
  readonly at: string;
  readonly milestone: JalonDeVisite;
  /** Le statut COURANT de la visite, pas celui du jalon. */
  readonly status: string;
  readonly scheduled_at: string | null;
  readonly property: { readonly id: number; readonly title: string } | null;
}

export interface ContactDuFil {
  readonly type: 'contact';
  readonly id: number;
  readonly at: string;
  readonly channel: string | null;
  /** Où le geste a été posé : sur la demande d'où vient la fiche (une réponse), ou sur la fiche. */
  readonly on: 'lead' | 'customer';
  readonly causer: PersonneDuFil | null;
}

export interface EtapeDuFil {
  readonly type: 'stage';
  readonly id: number;
  readonly at: string;
  readonly from: CustomerPipelineStage | null;
  readonly to: CustomerPipelineStage | null;
  readonly causer: PersonneDuFil | null;
}

/**
 * La création de la fiche, ou la modification de son identité et de son contact : les NOMS des
 * champs (`CustomerTimeline::CHAMPS_DE_LA_FICHE`), jamais leurs valeurs ; vide à la création.
 */
export interface FicheDuFil {
  readonly type: 'record';
  readonly id: number;
  readonly at: string;
  readonly milestone: 'created' | 'updated';
  readonly fields: readonly string[];
  readonly causer: PersonneDuFil | null;
}

/** Une tâche de la fiche : sa création ou son passage à « faite », avec son titre COURANT. */
export interface TacheDuFil {
  readonly type: 'task';
  readonly id: number;
  readonly at: string;
  readonly milestone: 'created' | 'done';
  readonly task: { readonly id: number; readonly title: string } | null;
  readonly causer: PersonneDuFil | null;
}

export type EntreeDuFil = NoteDuFil | VisiteDuFil | ContactDuFil | EtapeDuFil | FicheDuFil | TacheDuFil;

export const FIL_QUERY_KEY = {
  tout: (customerId: number) => ['customer-timeline', customerId] as const,
  filtre: (customerId: number, types: readonly TypeDuFil[] | null) =>
    ['customer-timeline', customerId, types === null ? 'tout' : types.join(',')] as const,
};

/** Une page du fil ; `types` `null` : tous. */
export async function fetchCustomerTimeline(
  token: string,
  customerId: number,
  { types = null, page = 1 }: { readonly types?: readonly TypeDuFil[] | null; readonly page?: number } = {},
): Promise<PaginatedResponse<EntreeDuFil>> {
  const qs = buildQueryString({
    page,
    per_page: ENTREES_PAR_PAGE,
    ...(types !== null && types.length > 0 ? { filter: { type: types } } : {}),
  });
  return apiRequest<PaginatedResponse<EntreeDuFil>>(cheminApi`/api/customers/${customerId}/timeline${requete(qs)}`, { token });
}
