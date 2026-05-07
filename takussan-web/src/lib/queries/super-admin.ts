import { ApiError } from '@/lib/api';
import type {
  AdminAgenciesResponse,
  AdminAgencyDetailResponse,
  AdminAgencyHealthResponse,
  AdminAgencyTeamResponse,
  AdminPropertiesResponse,
  AdminModerationResponse,
  BusinessEnumResponse,
  BusinessEnumsResponse,
  NotificationTemplateChannel,
  NotificationTemplateLocale,
  NotificationTemplatePreviewResponse,
  NotificationTemplateResponse,
  NotificationTemplatesResponse,
  PlatformSettingsResponse,
  AdminIntegrationsResponse,
  AdminIntegrationResponse,
  AdminIntegrationSchemaResponse,
  IntegrationTestResponse,
  IntegrationWebhooksResponse,
  MaintenanceStatusResponse,
  MaintenanceMode,
  MaintenanceSeverity,
  ModerationDecision,
  ModerationItemStatus,
  ModerationItemType,
  AgencyProvisioningResponse,
  AdminUserDetailResponse,
  AdminUserSessionsResponse,
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
  qs.set('fields[agencies]', 'id,name,slug,status,is_verified,verified_at,primary_admin_id,license_number,email,phone,created_at');
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

export async function fetchAdminAgencyDetail(agencyId: number): Promise<AdminAgencyDetailResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agencies]', 'id,name,slug,status,is_verified,verified_at,license_number,email,phone,website,description,commission_rate,currency,founded_at,created_at');
  qs.set('include', 'primaryAdmin,address');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyDetailResponse>(res);
}

export async function fetchAdminAgencyHealth(agencyId: number): Promise<AdminAgencyHealthResponse> {
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/health`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyHealthResponse>(res);
}

export async function fetchAdminAgencyTeam(agencyId: number): Promise<AdminAgencyTeamResponse> {
  const qs = new URLSearchParams();
  qs.set('include', 'roles');
  qs.set('fields[users]', 'id,first_name,last_name,email,status,last_login_at');
  qs.set('per_page', '10');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/team?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyTeamResponse>(res);
}

export async function fetchAdminAgencyProperties(agencyId: number): Promise<AdminPropertiesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[properties]', ADMIN_PROPERTY_FIELDS.join(','));
  qs.set('include', 'address,agency');
  qs.set('sort', '-created_at');
  qs.set('per_page', '8');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/properties?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminPropertiesResponse>(res);
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

export type AgencyOnboardingPayload = {
  agency: {
    name: string;
    slug?: string;
    type?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  admin: {
    first_name: string;
    last_name: string;
    email: string;
    language?: 'fr' | 'en' | 'wo';
  };
};

export async function postAgencyOnboarding(
  payload: AgencyOnboardingPayload,
): Promise<AgencyProvisioningResponse> {
  const res = await fetch('/api/super-admin/agencies', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<AgencyProvisioningResponse>(res);
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

export async function fetchAdminUserDetail(userId: number): Promise<AdminUserDetailResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[users]', 'id,username,first_name,last_name,email,phone,status,preferred_language,timezone,last_login_at,created_at');
  qs.set('include', 'roles');
  const res = await fetch(`/api/super-admin/users/${userId}?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminUserDetailResponse>(res);
}

export async function fetchAdminUserSessions(userId: number): Promise<AdminUserSessionsResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[personal_access_tokens]', 'id,name,last_used_at,created_at,expires_at');
  qs.set('per_page', '20');
  const res = await fetch(`/api/super-admin/users/${userId}/sessions?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminUserSessionsResponse>(res);
}

export async function fetchAdminUserActivity(userId: number): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  qs.set('sort', '-created_at');
  qs.set('per_page', '20');
  const res = await fetch(`/api/super-admin/users/${userId}/activity?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AuditLogResponse>(res);
}

export type UserSupportAction =
  | 'force-password-reset'
  | 'unlock'
  | 'reset-2fa'
  | 'revoke-sessions';

export async function postUserSupportAction(
  userId: number,
  action: UserSupportAction,
  reason: string,
): Promise<{ success: true; action_id: number }> {
  const res = await fetch(`/api/super-admin/users/${userId}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return jsonOrThrow<{ success: true; action_id: number }>(res);
}

export async function deleteAdminUserSession(
  userId: number,
  tokenId: number,
  reason: string,
): Promise<{ success: true; action_id: number }> {
  const res = await fetch(`/api/super-admin/users/${userId}/sessions/${tokenId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return jsonOrThrow<{ success: true; action_id: number }>(res);
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

/**
 * TCK-132 — sparse fields for the super-admin property table. Driven by
 * `fields[properties]=...` so the API only ships columns the UI renders.
 * Computed attributes (e.g. `main_photo_url`, `location`, `*_label`) are not
 * real DB columns and must NOT appear here — spatie rejects them with HTTP
 * 400 (`InvalidFieldQuery`).
 *
 * `agency_id` is included even though the table renders `agency.name` from the
 * `include=agency` relation: Eloquent needs the foreign key on each parent row
 * to eager-load the `belongsTo(Agency::class)` relation, otherwise `row.agency`
 * comes back null for every property.
 */
export const ADMIN_PROPERTY_FIELDS = [
  'id',
  'agency_id',
  'reference_number',
  'title',
  'slug',
  'type',
  'contract_type',
  'status',
  'visibility',
  'price',
  'currency',
  'published_at',
  'created_at',
] as const;

export interface FetchAdminPropertiesParams {
  readonly search?: string;
  readonly status?: string;
  readonly type?: string;
  readonly visibility?: string;
  readonly agencyId?: number;
  readonly sort?: string;
  readonly page?: number;
  readonly perPage?: number;
}

export async function fetchAdminProperties(
  params: FetchAdminPropertiesParams = {},
): Promise<AdminPropertiesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[properties]', ADMIN_PROPERTY_FIELDS.join(','));
  qs.set('include', 'address,agency');
  if (params.search) qs.set('filter[search]', params.search);
  if (params.status) qs.set('filter[status]', params.status);
  if (params.type) qs.set('filter[type]', params.type);
  if (params.visibility) qs.set('filter[visibility]', params.visibility);
  if (typeof params.agencyId === 'number') qs.set('filter[agency_id]', String(params.agencyId));
  qs.set('sort', params.sort ?? '-created_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));

  const res = await fetch(`/api/super-admin-properties?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminPropertiesResponse>(res);
}

export async function postPropertyAction(
  propertyId: number,
  action: 'publish' | 'unpublish',
): Promise<unknown> {
  const res = await fetch(`/api/super-admin-properties/${propertyId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<unknown>(res);
}

export async function archiveProperties(
  propertyIds: number[],
  reason?: string,
): Promise<{ archived: number; failed: number; archived_ids: number[] }> {
  const res = await fetch('/api/super-admin-properties/bulk-archive', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ property_ids: propertyIds, reason }),
  });
  return jsonOrThrow<{ archived: number; failed: number; archived_ids: number[] }>(res);
}

export async function deleteProperty(propertyId: number): Promise<unknown> {
  const res = await fetch(`/api/super-admin-properties/${propertyId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 204) return null;
  return jsonOrThrow<unknown>(res);
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

export async function fetchModerationQueue(params: {
  type?: ModerationItemType;
  status?: ModerationItemStatus;
  agencyId?: number;
  sort?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AdminModerationResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[moderation]', 'id,type,status,subject_type,subject_id,agency_id,reported_at,reason');
  qs.set('include', 'subject,reporter');
  if (params.type) qs.set('filter[type]', params.type);
  if (params.status) qs.set('filter[status]', params.status);
  if (typeof params.agencyId === 'number') qs.set('filter[agency_id]', String(params.agencyId));
  qs.set('sort', params.sort ?? '-reported_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));

  const res = await fetch(`/api/super-admin/moderation?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminModerationResponse>(res);
}

export async function postModerationDecision(
  itemId: string,
  payload: { decision: ModerationDecision; reason: string },
): Promise<{ data: { id: string; decision: ModerationDecision; subject_type: string; subject_id: number } }> {
  const res = await fetch(`/api/super-admin/moderation/${encodeURIComponent(itemId)}/decide`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<{ data: { id: string; decision: ModerationDecision; subject_type: string; subject_id: number } }>(res);
}

export async function fetchBusinessEnums(): Promise<BusinessEnumsResponse> {
  const res = await fetch('/api/super-admin/enums', { credentials: 'include' });
  return jsonOrThrow<BusinessEnumsResponse>(res);
}

export async function postBusinessEnumValue(
  key: string,
  payload: { value: string; labels: { fr: string; en?: string; wo?: string }; is_active: boolean },
): Promise<BusinessEnumResponse> {
  const res = await fetch(`/api/super-admin/enums/${key}/values`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<BusinessEnumResponse>(res);
}

export async function patchBusinessEnumValue(
  key: string,
  value: string,
  payload: { labels?: { fr?: string; en?: string; wo?: string }; is_active?: boolean },
): Promise<BusinessEnumResponse> {
  const res = await fetch(`/api/super-admin/enums/${key}/values/${value}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<BusinessEnumResponse>(res);
}

export async function deleteBusinessEnumValue(key: string, value: string): Promise<BusinessEnumResponse> {
  const res = await fetch(`/api/super-admin/enums/${key}/values/${value}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return jsonOrThrow<BusinessEnumResponse>(res);
}

export async function fetchNotificationTemplates(): Promise<NotificationTemplatesResponse> {
  const res = await fetch('/api/super-admin/notification-templates', { credentials: 'include' });
  return jsonOrThrow<NotificationTemplatesResponse>(res);
}

export async function patchNotificationTemplate(
  event: string,
  channel: NotificationTemplateChannel,
  payload: {
    is_active: boolean;
    templates: Record<NotificationTemplateLocale, { subject?: string | null; body: string }>;
  },
): Promise<NotificationTemplateResponse> {
  const res = await fetch(`/api/super-admin/notification-templates/${event}/${channel}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<NotificationTemplateResponse>(res);
}

export async function previewNotificationTemplate(
  event: string,
  channel: NotificationTemplateChannel,
  locale: NotificationTemplateLocale,
): Promise<NotificationTemplatePreviewResponse> {
  const res = await fetch(`/api/super-admin/notification-templates/${event}/${channel}/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
  return jsonOrThrow<NotificationTemplatePreviewResponse>(res);
}

export async function fetchPlatformSettings(): Promise<PlatformSettingsResponse> {
  const res = await fetch('/api/super-admin/settings', { credentials: 'include' });
  return jsonOrThrow<PlatformSettingsResponse>(res);
}

export async function patchPlatformSettings(
  payload: Record<string, string | number | string[]>,
): Promise<PlatformSettingsResponse> {
  const res = await fetch('/api/super-admin/settings', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<PlatformSettingsResponse>(res);
}

export async function fetchAdminIntegrations(): Promise<AdminIntegrationsResponse> {
  const res = await fetch('/api/super-admin/integrations', { credentials: 'include' });
  return jsonOrThrow<AdminIntegrationsResponse>(res);
}

export async function fetchAdminIntegrationSchema(id: number): Promise<AdminIntegrationSchemaResponse> {
  const res = await fetch(`/api/super-admin/integrations/${id}/schema`, { credentials: 'include' });
  return jsonOrThrow<AdminIntegrationSchemaResponse>(res);
}

export async function patchAdminIntegration(
  id: number,
  payload: { credentials?: Record<string, string>; is_active?: boolean; metadata?: Record<string, unknown> },
): Promise<AdminIntegrationResponse> {
  const res = await fetch(`/api/super-admin/integrations/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<AdminIntegrationResponse>(res);
}

export async function testAdminIntegration(id: number): Promise<IntegrationTestResponse> {
  const res = await fetch(`/api/super-admin/integrations/${id}/test`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<IntegrationTestResponse>(res);
}

export async function fetchIntegrationWebhooks(id: number): Promise<IntegrationWebhooksResponse> {
  const res = await fetch(`/api/super-admin/integrations/${id}/webhooks`, { credentials: 'include' });
  return jsonOrThrow<IntegrationWebhooksResponse>(res);
}

export async function fetchMaintenance(): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/super-admin/maintenance', { credentials: 'include' });
  return jsonOrThrow<MaintenanceStatusResponse>(res);
}

export async function scheduleMaintenance(payload: {
  starts_at: string;
  ends_at: string;
  mode: MaintenanceMode;
  severity: MaintenanceSeverity;
  messages: { fr: string; en?: string; wo?: string };
  banner_lead_minutes?: number;
}): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/super-admin/maintenance', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<MaintenanceStatusResponse>(res);
}

export async function cancelMaintenance(): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/super-admin/maintenance', {
    method: 'DELETE',
    credentials: 'include',
  });
  return jsonOrThrow<MaintenanceStatusResponse>(res);
}
