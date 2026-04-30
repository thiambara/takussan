import { apiRequest } from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';

export interface ActivityLogEntry {
  id: number;
  log_name: string | null;
  event: string | null;
  description: string | null;
  causer_id: number | null;
  causer_type: string | null;
  causer: { id: number; name: string | null; email: string | null } | null;
  subject_type: string | null;
  subject_id: number | null;
  properties: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogFilters {
  causer_id?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  event?: string | null;
  subject_type?: string | null;
  search?: string | null;
  page?: number;
  per_page?: number;
}

export async function fetchAuditLogs(
  token: string,
  filters: AuditLogFilters = {},
): Promise<PaginatedResponse<ActivityLogEntry>> {
  const params: Record<string, string> = {};

  if (filters.causer_id) params['filter[causer_id]'] = String(filters.causer_id);
  if (filters.date_from) params['filter[date_from]'] = filters.date_from;
  if (filters.date_to) params['filter[date_to]'] = filters.date_to;
  if (filters.event) params['filter[event]'] = filters.event;
  if (filters.subject_type) params['filter[subject_type]'] = filters.subject_type;
  if (filters.search) params['filter[search]'] = filters.search;
  if (filters.page) params['page'] = String(filters.page);
  params['per_page'] = String(filters.per_page ?? 50);
  params['order'] = 'desc';

  const qs = new URLSearchParams(params).toString();
  return apiRequest<PaginatedResponse<ActivityLogEntry>>(
    `/api/activity-log${qs ? '?' + qs : ''}`,
    { token },
  );
}

export function buildExportUrl(
  baseUrl: string,
  format: 'csv' | 'xlsx',
  filters: AuditLogFilters,
): string {
  const params: Record<string, string> = { format };

  if (filters.causer_id) params['filter[causer_id]'] = String(filters.causer_id);
  if (filters.date_from) params['filter[date_from]'] = filters.date_from;
  if (filters.date_to) params['filter[date_to]'] = filters.date_to;
  if (filters.event) params['filter[event]'] = filters.event;
  if (filters.subject_type) params['filter[subject_type]'] = filters.subject_type;
  if (filters.search) params['filter[search]'] = filters.search;

  const qs = new URLSearchParams(params).toString();
  return `${baseUrl}/api/activity-logs/export?${qs}`;
}
