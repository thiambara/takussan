import { ApiError } from '@/lib/api';
import type {
  AdminAgenciesResponse,
  AuditLogResponse,
  ImpersonationStartResponse,
  ImpersonationStopResponse,
  SystemMetricsResponse,
} from '@/types/super-admin';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

export async function fetchAdminAgencies(params: {
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AdminAgenciesResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('filter[status]', params.status);
  if (params.search) qs.set('filter[search]', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  const query = qs.toString();
  const res = await fetch(`/api/super-admin/agencies${query ? `?${query}` : ''}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgenciesResponse>(res);
}

export async function postAgencyAction(
  agencyId: number,
  action: 'verify' | 'suspend' | 'unverify',
): Promise<unknown> {
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<unknown>(res);
}

export async function fetchSystemMetrics(): Promise<SystemMetricsResponse> {
  const res = await fetch('/api/super-admin/system/metrics', { credentials: 'include' });
  return jsonOrThrow<SystemMetricsResponse>(res);
}

export async function postImpersonate(targetUserId: number): Promise<ImpersonationStartResponse> {
  const res = await fetch(`/api/super-admin/users/${targetUserId}/impersonate`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<ImpersonationStartResponse>(res);
}

export async function postStopImpersonation(targetUserId: number): Promise<ImpersonationStopResponse> {
  const res = await fetch('/api/super-admin/impersonate/stop', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: targetUserId }),
  });
  return jsonOrThrow<ImpersonationStopResponse>(res);
}

export async function fetchAuditLog(params: {
  event?: string;
  causerId?: number;
  subjectType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params.event) qs.set('filter[event]', params.event);
  if (params.causerId) qs.set('filter[causer_id]', String(params.causerId));
  if (params.subjectType) qs.set('filter[subject_type]', params.subjectType);
  if (params.dateFrom) qs.set('filter[date_from]', params.dateFrom);
  if (params.dateTo) qs.set('filter[date_to]', params.dateTo);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  qs.set('include', 'causer');
  const res = await fetch(`/api/super-admin/audit?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AuditLogResponse>(res);
}
