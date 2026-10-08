import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  AgencyStaffMember,
  AgentTask,
  TaskDue,
  TaskableOption,
  AgentAbsence,
  BulkResult,
  CalendarFeedState,
  CustomerActivityEntry,
  CustomerLinkedRecord,
  MatchingCustomer,
  MatchingProperty,
  MemberPortfolio,
  PortfolioCategory,
} from '@/types/agent-crm';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * TCK-591 — requêtes du CRM de l'agent. Module sans directive : appelable depuis un composant
 * client comme depuis une action serveur (cf. le piège Next 16 de `takussan-web/CLAUDE.md`).
 *
 * Toutes passent par `apiRequest`, donc l'appelant écrit `/api`.
 */

export const AGENT_CRM_QUERY_KEY = {
  activity: (customerId: number) => ['agent-crm', 'customer', customerId, 'activity'] as const,
  matchingProperties: (customerId: number) => ['agent-crm', 'customer', customerId, 'matching-properties'] as const,
  matchingCustomers: (propertyId: number) => ['agent-crm', 'property', propertyId, 'matching-customers'] as const,
  tasks: (due: string) => ['agent-crm', 'tasks', due] as const,
  taskables: (type: string, search: string) => ['agent-crm', 'taskables', type, search] as const,
  calendarFeed: () => ['agent-crm', 'calendar-feed'] as const,
  portfolio: (agencyId: number, userId: number) => ['agent-crm', 'agency', agencyId, 'portfolio', userId] as const,
  absences: (agencyId: number) => ['agent-crm', 'agency', agencyId, 'absences'] as const,
  linked: (customerId: number, kind: LinkedKind) => ['agent-crm', 'customer', customerId, 'linked', kind] as const,
  staff: (agencyId: number) => ['agent-crm', 'agency', agencyId, 'staff'] as const,
};

export type LinkedKind = 'visits' | 'bookings' | 'leases';

interface LinkedRow {
  id: number;
  status?: string | null;
  scheduled_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  reference_number?: string | null;
  property?: { id: number; title: string } | null;
}

/**
 * TCK-591 §4 — ce que la fiche client relie : ses visites, ses réservations, ses baux (le client y
 * est locataire). Chaque liste reste bornée par la règle de lecture de son propre index.
 */
export async function fetchCustomerLinked(
  token: string,
  customerId: number,
  kind: LinkedKind,
): Promise<CustomerLinkedRecord[]> {
  const spec = {
    visits: {
      path: '/api/property-visits',
      table: 'property_visits',
      filter: { customer_id: customerId },
      cols: ['id', 'property_id', 'status', 'scheduled_at'],
      sort: '-scheduled_at',
    },
    bookings: {
      path: '/api/bookings',
      table: 'bookings',
      filter: { customer_id: customerId },
      cols: ['id', 'property_id', 'reference_number', 'status', 'start_date', 'end_date'],
      sort: '-start_date',
    },
    leases: {
      path: '/api/leases',
      table: 'leases',
      filter: { tenant_id: customerId },
      cols: ['id', 'property_id', 'reference_number', 'status', 'start_date', 'end_date'],
      sort: '-start_date',
    },
  }[kind];
  const qs = buildQueryString({
    filter: spec.filter,
    include: ['property'],
    fields: { [spec.table]: spec.cols, properties: ['id', 'title'] },
    sort: spec.sort,
    per_page: 20,
  });
  const res = await apiRequest<PaginatedResponse<LinkedRow>>(`${spec.path}?${qs}`, { token });
  return res.data.map((row) => ({
    id: row.id,
    status: row.status ?? null,
    date: row.scheduled_at ?? row.start_date ?? null,
    end_date: row.end_date ?? null,
    reference_number: row.reference_number ?? null,
    property: row.property ? { id: row.property.id, title: row.property.title } : null,
  }));
}

/** Les agents de l'agence (liste réservée à l'administration : un 403 laisse « me désigner » seul). */
export async function fetchAgencyAgents(token: string, agencyId: number): Promise<AgencyStaffMember[]> {
  const qs = buildQueryString({
    filter: { role: 'agent' },
    fields: { users: ['id', 'first_name', 'last_name'] },
    per_page: 100,
  });
  const res = await apiRequest<PaginatedResponse<{ id: number; first_name: string | null; last_name: string | null }>>(
    cheminApi`/api/agencies/${agencyId}/members?${qs}`,
    { token },
  );
  return res.data.map((u) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') }));
}

export async function setCustomerPrimaryContact(token: string, customerId: number, userId: number): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/customers/${customerId}/primary-contact`, {
    method: 'POST',
    body: { user_id: userId },
    token,
  });
}

export async function fetchCustomerActivity(
  token: string,
  customerId: number,
  page = 1,
): Promise<PaginatedResponse<CustomerActivityEntry>> {
  const qs = buildQueryString({ page, per_page: 20 });
  return apiRequest<PaginatedResponse<CustomerActivityEntry>>(
    cheminApi`/api/customers/${customerId}/activity${requete(qs)}`,
    { token },
  );
}

export async function fetchMatchingProperties(
  token: string,
  customerId: number,
): Promise<PaginatedResponse<MatchingProperty>> {
  return apiRequest<PaginatedResponse<MatchingProperty>>(
    cheminApi`/api/customers/${customerId}/matching-properties?per_page=20`,
    { token },
  );
}

export async function fetchMatchingCustomers(
  token: string,
  propertyId: number,
): Promise<PaginatedResponse<MatchingCustomer>> {
  return apiRequest<PaginatedResponse<MatchingCustomer>>(
    cheminApi`/api/properties/${propertyId}/matching-customers?per_page=20`,
    { token },
  );
}

export async function fetchCalendarFeed(token: string): Promise<CalendarFeedState> {
  const res = await apiRequest<ApiResponse<CalendarFeedState>>('/api/me/calendar-feed', { token });
  return res.data;
}

export async function issueCalendarFeed(token: string): Promise<CalendarFeedState> {
  const res = await apiRequest<ApiResponse<CalendarFeedState>>('/api/me/calendar-feed', {
    method: 'POST',
    token,
  });
  return res.data;
}

export async function revokeCalendarFeed(token: string): Promise<void> {
  await apiRequest<unknown>('/api/me/calendar-feed', { method: 'DELETE', token });
}

export async function bulkPropertyVisibility(token: string, propertyIds: number[]): Promise<BulkResult> {
  return apiRequest<BulkResult>('/api/properties/bulk-visibility', {
    method: 'POST',
    body: { property_ids: propertyIds, visibility: 'private' },
    token,
  });
}

/**
 * TCK-603 — changer l'agent responsable d'un lot : la cible devient le collaborateur `agent`
 * principal de chaque bien, jamais son propriétaire (ADR-0036). `unchanged` : la cible l'était déjà.
 */
export async function bulkPropertyAssign(token: string, propertyIds: number[], userId: number): Promise<BulkResult> {
  return apiRequest<BulkResult>('/api/properties/bulk-assign', {
    method: 'POST',
    body: { property_ids: propertyIds, user_id: userId },
    token,
  });
}

/** `bulk-archive` (TCK-074) rend `archived` / `archived_ids` : ramené ici à la forme commune. */
export async function bulkPropertyArchive(token: string, propertyIds: number[]): Promise<BulkResult> {
  const res = await apiRequest<{ archived: number; archived_ids: number[]; failed: BulkResult['failed'] }>(
    '/api/properties/bulk-archive',
    { method: 'POST', body: { property_ids: propertyIds }, token },
  );
  return { updated: res.archived, updated_ids: res.archived_ids, failed: res.failed };
}

export async function fetchMemberPortfolio(
  token: string,
  agencyId: number,
  userId: number,
): Promise<MemberPortfolio> {
  const res = await apiRequest<ApiResponse<MemberPortfolio>>(
    cheminApi`/api/agencies/${agencyId}/members/${userId}/portfolio`,
    { token },
  );
  return res.data;
}

export interface HandoverPayload {
  successor_id?: number | null;
  successors?: Partial<Record<PortfolioCategory, number>>;
  leave_unassigned?: boolean;
  remove_after?: boolean;
}

export async function handOverPortfolio(
  token: string,
  agencyId: number,
  userId: number,
  payload: HandoverPayload,
): Promise<{ moved: Record<string, number>; unassigned: Record<string, number>; removed: boolean }> {
  const res = await apiRequest<ApiResponse<{ moved: Record<string, number>; unassigned: Record<string, number>; removed: boolean }>>(
    cheminApi`/api/agencies/${agencyId}/members/${userId}/handover`,
    { method: 'POST', body: payload, token },
  );
  return res.data;
}

export async function fetchAbsences(token: string, agencyId: number): Promise<AgentAbsence[]> {
  const res = await apiRequest<PaginatedResponse<AgentAbsence>>(
    cheminApi`/api/agencies/${agencyId}/absences?current=1&per_page=50`,
    { token },
  );
  return res.data;
}

export async function declareAbsence(
  token: string,
  agencyId: number,
  payload: { user_id: number; substitute_id: number; starts_at?: string | null; ends_at: string; reason?: string | null },
): Promise<AgentAbsence> {
  const res = await apiRequest<ApiResponse<AgentAbsence>>(cheminApi`/api/agencies/${agencyId}/absences`, {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function revokeAbsence(token: string, agencyId: number, absenceId: number): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/agencies/${agencyId}/absences/${absenceId}`, { method: 'DELETE', token });
}

/**
 * Les filtres d'échéance de « Mes tâches ». Ici et non dans le composant client : la page serveur
 * les lit aussi, et une valeur importée d'un module `'use client'` n'y est qu'une référence.
 */
export const TASK_DUE_FILTERS: readonly TaskDue[] = ['overdue', 'today', 'upcoming', 'none'];

/**
 * TCK-591 §3 — « Mes tâches » : les tâches que je porte ou que j'ai créées (plus celles d'un
 * collègue que je remplace), filtrées par échéance CÔTÉ SERVEUR (`filter[due]`, fuseau de Dakar).
 */
export async function fetchMyTasks(
  token: string,
  due: TaskDue | null,
  page = 1,
): Promise<PaginatedResponse<AgentTask>> {
  const qs = buildQueryString({
    ...(due ? { filter: { due } } : {}),
    sort: due === 'overdue' || due === 'today' || due === 'upcoming' ? 'due_at' : '-created_at',
    page,
    per_page: 30,
  });
  return apiRequest<PaginatedResponse<AgentTask>>(cheminApi`/api/tasks?${qs}`, { token });
}

/** Le modèle Laravel attendu par `StoreTaskRequest::TASKABLE_TYPES`. */
const TASKABLE_CLASS = { customer: 'App\\Models\\Customer', property: 'App\\Models\\Property' } as const;

export async function createTask(
  token: string,
  payload: { title: string; due_at?: string; taskable: { type: 'customer' | 'property'; id: number } },
): Promise<AgentTask> {
  const res = await apiRequest<ApiResponse<AgentTask>>('/api/tasks', {
    method: 'POST',
    body: {
      title: payload.title,
      ...(payload.due_at ? { due_at: payload.due_at } : {}),
      taskable_type: TASKABLE_CLASS[payload.taskable.type],
      taskable_id: payload.taskable.id,
    },
    token,
  });
  return res.data;
}

export async function setTaskDone(token: string, taskId: number, done: boolean): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: { status: done ? 'done' : 'open' },
    token,
  });
}

/** Recherche d'un client ou d'un bien à qui rattacher une tâche (huit résultats, colonnes minimales). */
export async function searchTaskables(
  token: string,
  type: 'customer' | 'property',
  search: string,
): Promise<TaskableOption[]> {
  if (type === 'customer') {
    const qs = buildQueryString({
      filter: { search },
      fields: { customers: ['id', 'first_name', 'last_name'] },
      per_page: 8,
    });
    const res = await apiRequest<PaginatedResponse<{ id: number; first_name: string; last_name: string }>>(
      cheminApi`/api/customers?${qs}`,
      { token },
    );
    return res.data.map((c) => ({ id: c.id, label: `${c.first_name} ${c.last_name}` }));
  }
  const qs = buildQueryString({ filter: { search }, fields: { properties: ['id', 'title'] }, per_page: 8 });
  const res = await apiRequest<PaginatedResponse<{ id: number; title: string }>>(cheminApi`/api/properties?${qs}`, { token });
  return res.data.map((p) => ({ id: p.id, label: p.title }));
}

/**
 * TCK-591 §8 — retirer un membre en ASSUMANT de laisser son portefeuille en place
 * (`leave_unassigned`) : sans ce drapeau, un portefeuille non vide rend 422 `agency_member.portfolio_not_empty`.
 */
export async function removeMember(
  token: string,
  agencyId: number,
  userId: number,
  leaveUnassigned: boolean,
): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/agencies/${agencyId}/members/${userId}`, {
    method: 'DELETE',
    body: leaveUnassigned ? { leave_unassigned: true } : undefined,
    token,
  });
}
