import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type {
  CustomerListItem,
  CustomerPipelineStage,
} from '@/types/customer';
import type { PipelineCustomerCard, PipelineStats, Task } from '@/types/pipeline';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { FiltresDuPipeline, ParametresDesStats } from '@/lib/crm/pipeline';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * TCK-083 — CRM pipeline queries.
 *
 * All reads use the spatie sparse-fieldset / include conventions documented
 * in CLAUDE.md → "API — Conventions frontend". The kanban only needs a tiny
 * subset of Customer columns plus three relations (`addedBy`, `notes`,
 * `tasks`) so the response stays small even when many cards are open.
 */

export const PIPELINE_CARD_FIELDS = [
  'id',
  'first_name',
  'last_name',
  // TCK-591 — « Appeler » / « WhatsApp » sur la carte.
  'phone',
  'pipeline_stage',
  'updated_at',
  'created_at',
  'added_by_id',
  // TCK-2592 — la carte enrichie : ce qu'il cherche, le dernier contact, la prochaine action, la
  // relance et son retard, le référent, l'étape proposée. Calculés pour le seul personnel (TCK-2588,
  // TCK-2591) : `null` pour le bailleur, sans erreur.
  'seeking_contract_type',
  'budget_max',
  'seeking_property_types',
  'seeking_cities',
  'seeking_neighborhoods',
  // TCK-2766 — le dernier contact ET son canal (« Appel il y a 9 j ») ; remplace `last_contacted_at`, dont il porte l'instant.
  'last_contact',
  'next_action',
  'follow_up',
  'referent',
  'suggested_stage',
] as const;

export const PIPELINE_STAGES: readonly CustomerPipelineStage[] = [
  'lead',
  'prospect',
  'qualified',
  'negotiating',
  'converted',
  'lost',
];

export const PIPELINE_COLUMN_PAGE_SIZE = 50;

/**
 * TCK-2592 — le tri des cartes : la relance la plus ancienne d'abord, comme la liste ; hors personnel,
 * l'API retombe d'elle-même sur la date de création (`Customer::buildQuery`).
 */
export const PIPELINE_SORT = '-follow_up_days';

export interface FetchPipelineColumnParams {
  readonly stage: CustomerPipelineStage;
  readonly perPage?: number;
  /** TCK-591 — « Charger plus » : la colonne s'arrêtait à ses 50 premières cartes, sans le dire. */
  readonly page?: number;
  /** TCK-2592 — la portée et la barre de filtres (`lib/crm/pipeline`), les mêmes que les statistiques. */
  readonly filtres?: FiltresDuPipeline;
}

export function buildPipelineColumnParams({
  stage,
  perPage = PIPELINE_COLUMN_PAGE_SIZE,
  page,
  filtres,
}: FetchPipelineColumnParams): SpatieQueryParams {
  return {
    fields: { customers: PIPELINE_CARD_FIELDS },
    filter: { status: 'active', ...filtres, pipeline_stage: stage },
    include: ['tasksCount'],
    sort: PIPELINE_SORT,
    per_page: perPage,
    ...(page && page > 1 ? { page } : {}),
  };
}

export async function fetchPipelineColumn(
  token: string,
  params: FetchPipelineColumnParams,
): Promise<PipelineCustomerCard[]> {
  return (await fetchPipelineColumnPage(token, params)).cartes;
}

export interface PageDeColonne {
  readonly cartes: PipelineCustomerCard[];
  /** `meta.total` de la lecture : ce que la colonne compte, toutes pages comprises. */
  readonly total: number;
}

/**
 * Une page de colonne ET son compte : une colonne bornée (`sorties=30`) n'a pas d'autre compte que sa
 * propre pagination — « Charger plus » ne s'offre que si elle a une autre page à lire.
 */
export async function fetchPipelineColumnPage(token: string, params: FetchPipelineColumnParams): Promise<PageDeColonne> {
  const qs = buildQueryString(buildPipelineColumnParams(params));
  const res = await apiRequest<{ data: PipelineCustomerCard[]; meta?: { total?: number } }>(
    cheminApi`/api/customers${requete(qs)}`,
    { token },
  );
  return { cartes: res.data, total: res.meta?.total ?? res.data.length };
}

export interface FetchPipelineListParams {
  /** Les filtres des colonnes, plus le segment (`follow_up`) ; jamais d'étape : les étapes vivantes. */
  readonly filtres: FiltresDuPipeline;
  readonly page?: number;
  readonly perPage?: number;
}

/** TCK-2592 — la liste des relances (téléphone) et la vue Liste (bureau) : les étapes vivantes, triées par retard. */
export function buildPipelineListParams({ filtres, page, perPage = PIPELINE_COLUMN_PAGE_SIZE }: FetchPipelineListParams): SpatieQueryParams {
  return {
    fields: { customers: PIPELINE_CARD_FIELDS },
    filter: { ...filtres, stage_group: 'active' },
    include: ['tasksCount'],
    sort: PIPELINE_SORT,
    per_page: perPage,
    ...(page && page > 1 ? { page } : {}),
  };
}

export interface PagePipeline {
  readonly lignes: PipelineCustomerCard[];
  readonly total: number;
}

export async function fetchPipelineList(token: string, params: FetchPipelineListParams): Promise<PagePipeline> {
  const qs = buildQueryString(buildPipelineListParams(params));
  const res = await apiRequest<{ data: PipelineCustomerCard[]; meta?: { total?: number } }>(cheminApi`/api/customers${requete(qs)}`, { token });
  return { lignes: res.data, total: res.meta?.total ?? res.data.length };
}

export async function fetchPipelineStats(
  token: string,
  params?: ParametresDesStats,
): Promise<PipelineStats> {
  // TCK-2592 — `scope` et les filtres des colonnes (TCK-2591) ; sans paramètre, la lecture d'avant.
  const qs = params ? buildQueryString({ filter: { ...params.filter }, ...(params.scope ? { extra: { scope: params.scope } } : {}) }) : '';
  const res = await apiRequest<ApiResponse<PipelineStats>>(
    cheminApi`/api/customers/pipeline-stats${requete(qs)}`,
    { token },
  );
  return res.data;
}

/**
 * TCK-2591 — « Plus tard » sur la proposition d'étape : `reason_event` nomme le fait que l'agent a vu
 * (409 `customer.suggested_stage_stale` s'il n'est plus celui de la proposition courante).
 */
export async function dismissSuggestedStage(token: string, customerId: number, reasonEvent: string): Promise<void> {
  await apiRequest<void>(cheminApi`/api/customers/${customerId}/suggested-stage/dismiss`, {
    method: 'POST',
    body: { reason_event: reasonEvent },
    token,
  });
}

export async function patchCustomerPipelineStage(
  token: string,
  customerId: number,
  stage: CustomerPipelineStage,
  reason?: string,
): Promise<CustomerListItem> {
  const res = await apiRequest<ApiResponse<CustomerListItem>>(
    cheminApi`/api/customers/${customerId}/pipeline-stage`,
    {
      method: 'PATCH',
      body: { pipeline_stage: stage, ...(reason ? { reason } : {}) },
      token,
    },
  );
  return res.data;
}

export async function fetchCustomerTasks(
  token: string,
  customerId: number,
): Promise<Task[]> {
  // TCK-1373 (P135.05) — TOUTES les tâches du client : `sort=due_at` met d'abord les terminées aux
  // échéances anciennes, et une page de 50 perdait les dernières, ouvertes comprises, que le
  // panneau du pipeline compte.
  const res = await lireToutesLesPages((page) => {
    // Tasks endpoint is filterable on (taskable_type, taskable_id).
    const qs = buildQueryString({
      filter: {
        taskable_type: 'App\\Models\\Customer',
        taskable_id: customerId,
      },
      sort: 'due_at',
      page,
      per_page: PAR_PAGE_MAX,
    });
    return apiRequest<PaginatedResponse<Task>>(cheminApi`/api/tasks${requete(qs)}`, {
      token,
    });
  });
  return res.data;
}

export async function createCustomerTask(
  token: string,
  customerId: number,
  payload: {
    title: string;
    description?: string;
    due_at?: string;
    priority?: 'low' | 'medium' | 'high';
    assigned_to_id?: number | null;
  },
): Promise<Task> {
  const res = await apiRequest<ApiResponse<Task>>('/api/tasks', {
    method: 'POST',
    body: {
      ...payload,
      taskable_id: customerId,
      taskable_type: 'App\\Models\\Customer',
    },
    token,
  });
  return res.data;
}

export async function updateTask(
  token: string,
  taskId: number,
  payload: Partial<{
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    due_at: string | null;
  }>,
): Promise<Task> {
  const res = await apiRequest<ApiResponse<Task>>(cheminApi`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: payload,
    token,
  });
  return res.data;
}
