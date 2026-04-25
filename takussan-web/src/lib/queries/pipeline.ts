import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, SpatieQueryParams } from '@/types/api';
import type {
  CustomerListItem,
  CustomerPipelineStage,
} from '@/types/customer';
import type { PipelineCustomerCard, PipelineStats, Task } from '@/types/pipeline';

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
  'pipeline_stage',
  'updated_at',
  'created_at',
  'added_by_id',
] as const;

export const PIPELINE_STAGES: readonly CustomerPipelineStage[] = [
  'lead',
  'prospect',
  'qualified',
  'negotiating',
  'converted',
  'lost',
];

export interface FetchPipelineColumnParams {
  readonly stage: CustomerPipelineStage;
  readonly perPage?: number;
}

export function buildPipelineColumnParams({
  stage,
  perPage = 50,
}: FetchPipelineColumnParams): SpatieQueryParams {
  return {
    fields: { customers: PIPELINE_CARD_FIELDS },
    filter: { pipeline_stage: stage },
    include: ['addedBy', 'tasksCount'],
    sort: '-updated_at',
    per_page: perPage,
  };
}

export async function fetchPipelineColumn(
  token: string,
  params: FetchPipelineColumnParams,
): Promise<PipelineCustomerCard[]> {
  const qs = buildQueryString(buildPipelineColumnParams(params));
  const res = await apiRequest<{ data: PipelineCustomerCard[]; meta?: unknown }>(
    `/api/customers${qs ? `?${qs}` : ''}`,
    { token },
  );
  return res.data;
}

export async function fetchPipelineStats(
  token: string,
): Promise<PipelineStats> {
  const res = await apiRequest<ApiResponse<PipelineStats>>(
    '/api/customers/pipeline-stats',
    { token },
  );
  return res.data;
}

export async function patchCustomerPipelineStage(
  token: string,
  customerId: number,
  stage: CustomerPipelineStage,
  reason?: string,
): Promise<CustomerListItem> {
  const res = await apiRequest<ApiResponse<CustomerListItem>>(
    `/api/customers/${customerId}/pipeline-stage`,
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
  // Tasks endpoint is filterable on (taskable_type, taskable_id).
  const qs = buildQueryString({
    filter: {
      taskable_type: 'App\\Models\\Customer',
      taskable_id: customerId,
    },
    sort: 'due_at',
    per_page: 50,
  });
  const res = await apiRequest<{ data: Task[] }>(`/api/tasks${qs ? `?${qs}` : ''}`, {
    token,
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
  const res = await apiRequest<ApiResponse<Task>>(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: payload,
    token,
  });
  return res.data;
}
