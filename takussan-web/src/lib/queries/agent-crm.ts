import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  AgentAbsence,
  BulkResult,
  CalendarFeedState,
  CustomerActivityEntry,
  MatchingCustomer,
  MatchingProperty,
  MemberPortfolio,
  PortfolioCategory,
} from '@/types/agent-crm';

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
  calendarFeed: () => ['agent-crm', 'calendar-feed'] as const,
  portfolio: (agencyId: number, userId: number) => ['agent-crm', 'agency', agencyId, 'portfolio', userId] as const,
  absences: (agencyId: number) => ['agent-crm', 'agency', agencyId, 'absences'] as const,
};

export async function fetchCustomerActivity(
  token: string,
  customerId: number,
  page = 1,
): Promise<PaginatedResponse<CustomerActivityEntry>> {
  const qs = buildQueryString({ page, per_page: 20 });
  return apiRequest<PaginatedResponse<CustomerActivityEntry>>(
    `/api/customers/${customerId}/activity${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function fetchMatchingProperties(
  token: string,
  customerId: number,
): Promise<PaginatedResponse<MatchingProperty>> {
  return apiRequest<PaginatedResponse<MatchingProperty>>(
    `/api/customers/${customerId}/matching-properties?per_page=20`,
    { token },
  );
}

export async function fetchMatchingCustomers(
  token: string,
  propertyId: number,
): Promise<PaginatedResponse<MatchingCustomer>> {
  return apiRequest<PaginatedResponse<MatchingCustomer>>(
    `/api/properties/${propertyId}/matching-customers?per_page=20`,
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
    `/api/agencies/${agencyId}/members/${userId}/portfolio`,
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
    `/api/agencies/${agencyId}/members/${userId}/handover`,
    { method: 'POST', body: payload, token },
  );
  return res.data;
}

export async function fetchAbsences(token: string, agencyId: number): Promise<AgentAbsence[]> {
  const res = await apiRequest<PaginatedResponse<AgentAbsence>>(
    `/api/agencies/${agencyId}/absences?current=1&per_page=50`,
    { token },
  );
  return res.data;
}

export async function declareAbsence(
  token: string,
  agencyId: number,
  payload: { user_id: number; substitute_id: number; starts_at?: string | null; ends_at: string; reason?: string | null },
): Promise<AgentAbsence> {
  const res = await apiRequest<ApiResponse<AgentAbsence>>(`/api/agencies/${agencyId}/absences`, {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function revokeAbsence(token: string, agencyId: number, absenceId: number): Promise<void> {
  await apiRequest<unknown>(`/api/agencies/${agencyId}/absences/${absenceId}`, { method: 'DELETE', token });
}
