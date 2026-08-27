import { ApiError } from '@/lib/api';
import type {
  AdminAgenciesResponse,
  AdminAgencyDetailResponse,
  AdminAgencyHealthResponse,
  AdminAgencyTeamResponse,
  KycDossierResponse,
  KycDossiersResponse,
  KycDossierStatus,
  PlanPayload,
  PlanResponse,
  PlansResponse,
  AgencySubscriptionResponse,
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
  AdminFeatureFlagsResponse,
  AlertRulesResponse,
  AlertRuleResponse,
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
  AnnouncementsResponse,
  AnnouncementPayload,
  AnnouncementSegment,
  DataExport,
  PlatformHealthResponse,
  FailedJobsResponse,
  SchedulerResponse,
  PlatformPayoutsResponse,
  PlatformPayoutResponse,
  PlatformPayoutClosePeriodResponse,
  GrowthResponse,
  RevenueResponse,
  CohortsResponse,
  FunnelResponse,
  GrowthMetric,
  ReportGranularity,
  ReportPeriod,
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
  createdFrom?: string;
  createdTo?: string;
  sort?: 'created_at' | '-created_at' | 'name' | '-name' | 'members_count' | '-members_count' | 'properties_count' | '-properties_count';
  page?: number;
  perPage?: number;
} = {}): Promise<AdminAgenciesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agencies]', 'id,name,slug,status,is_verified,verified_at,primary_admin_id,license_number,email,phone,logo_url,properties_count,members_count,last_activity_at,created_at');
  if (params.status) qs.set('filter[status]', params.status);
  if (params.search) qs.set('filter[search]', params.search);
  if (params.createdFrom) qs.set('filter[created_from]', params.createdFrom);
  if (params.createdTo) qs.set('filter[created_to]', params.createdTo);
  qs.set('sort', params.sort ?? '-created_at');
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
  // TCK-278 — PAS d'`include=roles` : `roles` n'est plus une relation Eloquent
  // (spatie/laravel-permission est désinstallé) et cet endpoint est monté sur
  // `User::buildQuery()`, qui répond `400 InvalidIncludeQuery` sur un include
  // non déclaré. Le backend renvoie déjà `roles` dans le payload.
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

const KYC_DOSSIER_FIELDS = [
  'id',
  'subject_type',
  'subject_id',
  'status',
  'submitted_at',
  'reviewed_at',
  'reviewed_by',
  'rejection_reason',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

export async function fetchAdminAgencyKyc(agencyId: number): Promise<KycDossierResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[kyc_dossiers]', KYC_DOSSIER_FIELDS);
  qs.set('include', 'subject,reviewer');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/kyc?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<KycDossierResponse>(res);
}

/**
 * La file KYC du super-admin.
 *
 * TCK-362 — `include=subject` n'est PAS décoratif : sans lui `KycDossierResource` n'émet que
 * `subject_id`, et l'écran retombe sur « Agence #12 ». C'est UN `include` pour toute la page,
 * jamais une requête par ligne.
 */
export async function fetchAdminKycQueue(params: {
  status?: KycDossierStatus;
  page?: number;
  perPage?: number;
} = {}): Promise<KycDossiersResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[kyc_dossiers]', KYC_DOSSIER_FIELDS);
  qs.set('include', 'subject');
  qs.set('filter[subject_type]', 'Agency');
  qs.set('filter[status]', params.status ?? 'submitted');
  qs.set('sort', 'submitted_at');
  qs.set('per_page', String(params.perPage ?? 20));
  if (params.page) qs.set('page', String(params.page));
  const res = await fetch(`/api/super-admin/kyc?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<KycDossiersResponse>(res);
}

export async function postKycReview(
  dossierId: number,
  action: 'verify' | 'reject',
  reason?: string,
): Promise<KycDossierResponse> {
  const res = await fetch(`/api/super-admin/kyc/${dossierId}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: action === 'reject' ? { 'Content-Type': 'application/json' } : undefined,
    body: action === 'reject' ? JSON.stringify({ reason }) : undefined,
  });
  return jsonOrThrow<KycDossierResponse>(res);
}

export async function fetchAdminPlans(): Promise<PlansResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[plans]', 'id,code,label,description,monthly_price_xof,platform_fee_pct,trial_days,limits,is_active,sort_order,created_at,updated_at');
  qs.set('sort', 'sort_order');
  const res = await fetch(`/api/super-admin/plans?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<PlansResponse>(res);
}

export async function createAdminPlan(payload: Required<Pick<PlanPayload, 'code' | 'label' | 'monthly_price_xof' | 'platform_fee_pct'>> & PlanPayload): Promise<PlanResponse> {
  const res = await fetch('/api/super-admin/plans', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<PlanResponse>(res);
}

export async function updateAdminPlan(planId: number, payload: PlanPayload): Promise<PlanResponse> {
  const res = await fetch(`/api/super-admin/plans/${planId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<PlanResponse>(res);
}

export async function deleteAdminPlan(planId: number): Promise<unknown> {
  const res = await fetch(`/api/super-admin/plans/${planId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return jsonOrThrow<unknown>(res);
}

export async function fetchAdminAgencySubscription(agencyId: number): Promise<AgencySubscriptionResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agency_subscriptions]', 'id,agency_id,plan_id,status,trial_ends_at,current_period_start,current_period_end,ended_at,platform_fee_pct_override,limits_override,created_at,updated_at');
  qs.set('include', 'plan');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/subscription?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AgencySubscriptionResponse>(res);
}

export async function assignAdminAgencySubscription(
  agencyId: number,
  payload: {
    plan_id: number;
    trial_ends_at?: string | null;
    overrides?: { platform_fee_pct?: number | null; limits?: Record<string, number> };
  },
): Promise<AgencySubscriptionResponse> {
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/subscription`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<AgencySubscriptionResponse>(res);
}

export async function cancelAdminAgencySubscription(agencyId: number): Promise<AgencySubscriptionResponse> {
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/subscription/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<AgencySubscriptionResponse>(res);
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
    /**
     * TCK-270 — Display currency picked from step 1 of the super-admin wizard.
     * Accepts any code from the backend Currency enum (XOF, XAF, EUR, USD);
     * omit to keep the API default (XOF).
     */
    currency?: string;
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
  // TCK-278 — include mort : `roles` n'existe plus comme relation. Inoffensif
  // ici (l'endpoint n'utilise pas `buildQuery`), mais c'est le même paramètre
  // qui produit un 400 sur `/team` — on ne le laisse pas traîner comme modèle.
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
 * comes back null for every property. Vérifié le 2026-08-21 sur l'API réelle avec
 * l'équivalent `user_id` : `fields[properties]=id,title&include=owner` rend
 * `owner: null`, `id,user_id,title` rend l'objet. La FK n'est pas décorative.
 *
 * TCK-336 — cette liste et les clés que `SuperAdminPropertiesTable` / `agency-detail`
 * lisent réellement sont comparées par
 * `queries/__tests__/property-fields.coverage.test.ts`. Deux points MESURÉS le 2026-08-21,
 * contre ce que TCK-336 affirmait :
 *   · ce tableau n'a AUCUNE vignette — ni `<img>`, ni `next/image`, ni `main_photo_url`
 *     dans le fichier. Ne pas lui en « rétablir » une ;
 *   · les seules clés qu'il lit hors colonnes sont `location`, `status_label` et `agency`.
 *     Elles ne peuvent pas être demandées (spatie rend 400) : la ressource les sert
 *     inconditionnellement, et le test le vérifie des deux côtés.
 */
export const ADMIN_PROPERTY_FIELDS = [
  'id',
  'agency_id',
  'reference_number',
  'title',
  'slug',
  'type',
  'contract_type',
  'rent_period',
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

export async function fetchAdminFeatureFlags(): Promise<AdminFeatureFlagsResponse> {
  const res = await fetch('/api/super-admin/feature-flags', { credentials: 'include' });
  return jsonOrThrow<AdminFeatureFlagsResponse>(res);
}

export async function patchAdminFeatureFlag(
  key: string,
  payload: { enabled: boolean; segments?: { roles?: string[]; agency_ids?: number[]; rollout_percentage?: number } },
): Promise<AdminFeatureFlagsResponse> {
  const res = await fetch(`/api/super-admin/feature-flags/${key}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<AdminFeatureFlagsResponse>(res);
}

export async function overrideAdminFeatureFlag(key: string, enabled: boolean): Promise<{ data: { key: string; enabled: boolean } }> {
  const res = await fetch(`/api/super-admin/feature-flags/${key}/override`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return jsonOrThrow<{ data: { key: string; enabled: boolean } }>(res);
}

export async function fetchAlertRules(): Promise<AlertRulesResponse> {
  const res = await fetch('/api/super-admin/alert-rules', { credentials: 'include' });
  return jsonOrThrow<AlertRulesResponse>(res);
}

export async function createAlertRule(payload: {
  event: string;
  channels: string[];
  recipients: { emails?: string[]; webhooks?: string[] };
  is_active: boolean;
}): Promise<AlertRuleResponse> {
  const res = await fetch('/api/super-admin/alert-rules', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<AlertRuleResponse>(res);
}

export async function patchAlertRule(
  id: number,
  payload: Partial<{ event: string; channels: string[]; recipients: { emails?: string[]; webhooks?: string[] }; is_active: boolean }>,
): Promise<AlertRuleResponse> {
  const res = await fetch(`/api/super-admin/alert-rules/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<AlertRuleResponse>(res);
}

export async function deleteAlertRule(id: number): Promise<unknown> {
  const res = await fetch(`/api/super-admin/alert-rules/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.status === 204) return null;
  return jsonOrThrow<unknown>(res);
}

export async function testAlertRule(id: number): Promise<{ data: { queued: boolean } }> {
  const res = await fetch(`/api/super-admin/alert-rules/${id}/test`, { method: 'POST', credentials: 'include' });
  return jsonOrThrow<{ data: { queued: boolean } }>(res);
}

export async function fetchAdminAnnouncements(params: {
  isActive?: boolean;
  page?: number;
  perPage?: number;
} = {}): Promise<AnnouncementsResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[announcements]', 'id,title,body,severity,segment,starts_at,ends_at,is_active,created_by,created_at,updated_at');
  qs.set('sort', '-starts_at');
  if (typeof params.isActive === 'boolean') qs.set('filter[is_active]', String(params.isActive ? 1 : 0));
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));

  const res = await fetch(`/api/super-admin/announcements?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<AnnouncementsResponse>(res);
}

export async function createAdminAnnouncement(payload: AnnouncementPayload): Promise<{ data: AnnouncementPayload & { id: number } }> {
  const res = await fetch('/api/super-admin/announcements', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<{ data: AnnouncementPayload & { id: number } }>(res);
}

export async function patchAdminAnnouncement(
  id: number,
  payload: Partial<AnnouncementPayload> & { segment?: AnnouncementSegment },
): Promise<{ data: AnnouncementPayload & { id: number } }> {
  const res = await fetch(`/api/super-admin/announcements/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<{ data: AnnouncementPayload & { id: number } }>(res);
}

export async function deactivateAdminAnnouncement(id: number): Promise<{ data: AnnouncementPayload & { id: number } }> {
  const res = await fetch(`/api/super-admin/announcements/${id}/deactivate`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<{ data: AnnouncementPayload & { id: number } }>(res);
}

export async function requestAdminUserDataExport(
  userId: number,
  reason: 'support' | 'legal_request' | 'user_inquiry' | 'other',
): Promise<{ data: DataExport }> {
  const res = await fetch(`/api/super-admin/users/${userId}/data-exports`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return jsonOrThrow<{ data: DataExport }>(res);
}

export async function fetchPlatformHealth(): Promise<PlatformHealthResponse> {
  const res = await fetch('/api/super-admin/health', { credentials: 'include' });
  return jsonOrThrow<PlatformHealthResponse>(res);
}

export async function fetchFailedJobs(params: { page?: number; perPage?: number } = {}): Promise<FailedJobsResponse> {
  const qs = new URLSearchParams();
  qs.set('per_page', String(params.perPage ?? 20));
  if (params.page) qs.set('page', String(params.page));
  const res = await fetch(`/api/super-admin/jobs/failed?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<FailedJobsResponse>(res);
}

export async function retryFailedJob(id: number): Promise<{ data: { retried: boolean } }> {
  const res = await fetch(`/api/super-admin/jobs/failed/${id}/retry`, { method: 'POST', credentials: 'include' });
  return jsonOrThrow<{ data: { retried: boolean } }>(res);
}

export async function deleteFailedJob(id: number): Promise<{ data: { deleted: boolean } }> {
  const res = await fetch(`/api/super-admin/jobs/failed/${id}`, { method: 'DELETE', credentials: 'include' });
  return jsonOrThrow<{ data: { deleted: boolean } }>(res);
}

export async function retryAllFailedJobs(): Promise<{ data: { queued: number } }> {
  const res = await fetch('/api/super-admin/jobs/failed/retry-all', { method: 'POST', credentials: 'include' });
  return jsonOrThrow<{ data: { queued: number } }>(res);
}

export async function fetchScheduler(): Promise<SchedulerResponse> {
  const res = await fetch('/api/super-admin/scheduler', { credentials: 'include' });
  return jsonOrThrow<SchedulerResponse>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// TCK-223 — Platform payouts
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_PAYOUT_FIELDS =
  'id,agency_id,period_start,period_end,gross_amount,platform_fee_amount,net_amount,currency,status,approved_by,processed_at,failure_reason,metadata,created_at,updated_at';

export async function fetchAdminPlatformPayouts(params: {
  agencyId?: number | null;
  status?: string;
  periodEndMin?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<PlatformPayoutsResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[platform_payouts]', PLATFORM_PAYOUT_FIELDS);
  qs.set('sort', '-period_end');
  if (params.agencyId) qs.set('filter[agency_id]', String(params.agencyId));
  if (params.status) qs.set('filter[status]', params.status);
  if (params.periodEndMin) qs.set('filter[period_end_min]', params.periodEndMin);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  const res = await fetch(`/api/super-admin/payouts?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<PlatformPayoutsResponse>(res);
}

export async function fetchAdminPlatformPayout(payoutId: number): Promise<PlatformPayoutResponse> {
  const res = await fetch(`/api/super-admin/payouts/${payoutId}`, { credentials: 'include' });
  return jsonOrThrow<PlatformPayoutResponse>(res);
}

export async function closeAdminPlatformPayoutPeriod(payload: {
  agency_id?: number | null;
  period_end: string;
}): Promise<PlatformPayoutClosePeriodResponse> {
  const res = await fetch('/api/super-admin/payouts/close-period', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<PlatformPayoutClosePeriodResponse>(res);
}

export async function approveAdminPlatformPayout(payoutId: number): Promise<PlatformPayoutResponse> {
  const res = await fetch(`/api/super-admin/payouts/${payoutId}/approve`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<PlatformPayoutResponse>(res);
}

export async function markAdminPlatformPayoutPaid(
  payoutId: number,
  payload: { processed_at: string; metadata?: { bank_ref?: string; batch_id?: string } },
): Promise<PlatformPayoutResponse> {
  const res = await fetch(`/api/super-admin/payouts/${payoutId}/mark-paid`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<PlatformPayoutResponse>(res);
}

export async function cancelAdminPlatformPayout(
  payoutId: number,
  reason: string,
): Promise<PlatformPayoutResponse> {
  const res = await fetch(`/api/super-admin/payouts/${payoutId}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return jsonOrThrow<PlatformPayoutResponse>(res);
}

export async function fetchMyPlatformPayouts(): Promise<PlatformPayoutsResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[platform_payouts]', PLATFORM_PAYOUT_FIELDS);
  qs.set('sort', '-period_end');
  qs.set('per_page', '20');
  const res = await fetch(`/api/me/payouts?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<PlatformPayoutsResponse>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// TCK-227 — Cross-tenant reporting
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAdminReportGrowth(params: {
  metric: GrowthMetric;
  period?: ReportPeriod;
  granularity?: ReportGranularity;
  /** TCK-361 — plage libre. Les deux bornes voyagent ensemble ; l'API refuse une borne seule. */
  starts_at?: string;
  ends_at?: string;
}): Promise<GrowthResponse> {
  const qs = new URLSearchParams();
  qs.set('metric', params.metric);
  if (params.period) qs.set('period', params.period);
  if (params.granularity) qs.set('granularity', params.granularity);
  if (params.starts_at && params.ends_at) {
    qs.set('starts_at', params.starts_at);
    qs.set('ends_at', params.ends_at);
  }
  const res = await fetch(`/api/super-admin/reports/growth?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<GrowthResponse>(res);
}

export async function fetchAdminReportRevenue(params: {
  period?: ReportPeriod;
  granularity?: ReportGranularity;
  /** TCK-361 — plage libre. Les deux bornes voyagent ensemble ; l'API refuse une borne seule. */
  starts_at?: string;
  ends_at?: string;
} = {}): Promise<RevenueResponse> {
  const qs = new URLSearchParams();
  if (params.period) qs.set('period', params.period);
  if (params.granularity) qs.set('granularity', params.granularity);
  if (params.starts_at && params.ends_at) {
    qs.set('starts_at', params.starts_at);
    qs.set('ends_at', params.ends_at);
  }
  const res = await fetch(`/api/super-admin/reports/revenue?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<RevenueResponse>(res);
}

export async function fetchAdminReportCohorts(params: { depth?: number } = {}): Promise<CohortsResponse> {
  const qs = new URLSearchParams();
  if (params.depth) qs.set('depth', String(params.depth));
  const res = await fetch(`/api/super-admin/reports/cohorts?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<CohortsResponse>(res);
}

export async function fetchAdminReportFunnel(params: { period?: ReportPeriod } = {}): Promise<FunnelResponse> {
  const qs = new URLSearchParams();
  if (params.period) qs.set('period', params.period);
  const res = await fetch(`/api/super-admin/reports/funnel?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<FunnelResponse>(res);
}

type AdminReportExportResult =
  | { status: 'downloaded'; filename: string }
  | { status: 'queued'; data: unknown };

export async function exportAdminReport(
  report: 'growth' | 'revenue' | 'cohorts' | 'funnel',
  params: Record<string, string | number>,
): Promise<AdminReportExportResult> {
  const qs = new URLSearchParams();
  qs.set('format', 'csv');
  for (const [key, value] of Object.entries(params)) {
    qs.set(key, String(value));
  }
  const res = await fetch(`/api/super-admin/reports/${report}/export?${qs.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return { status: 'queued', data: await res.json() };
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = filenameFromDisposition(disposition) ?? `takussan-${report}.csv`;
  triggerDownload(blob, filename);

  return { status: 'downloaded', filename };
}

function filenameFromDisposition(disposition: string): string | null {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded.replace(/"/g, ''));

  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain ?? null;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/* ------------------------------------------------------------------ */
/* TCK-264 — Super-admin cooptation                                    */
/* ------------------------------------------------------------------ */

export interface SuperAdminEntry {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status: string | null;
  two_factor_enabled: boolean;
  force_2fa_at_first_login: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface SuperAdminPendingInvitation {
  id: number;
  email: string;
  role: string;
  status: string;
  agency_id: number | null;
  invited_by: number | null;
  expires_at: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SuperAdminCooptationListing {
  super_admins: SuperAdminEntry[];
  pending_invitations: SuperAdminPendingInvitation[];
}

export async function fetchSuperAdminListing(): Promise<SuperAdminCooptationListing> {
  const res = await fetch('/api/super-admin/super-admins', { credentials: 'include' });
  const json = await jsonOrThrow<{ data: SuperAdminCooptationListing }>(res);
  return json.data;
}

export async function inviteSuperAdmin(payload: {
  email: string;
  first_name: string;
  last_name: string;
}): Promise<SuperAdminPendingInvitation> {
  const res = await fetch('/api/super-admin/super-admins/invite', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await jsonOrThrow<{ data: SuperAdminPendingInvitation }>(res);
  return json.data;
}

/* ------------------------------------------------------------------ */
/* TCK-268 — Agency upgrade review console                            */
/* ------------------------------------------------------------------ */

export type AgencyUpgradeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revoked';

export interface AdminAgencyUpgradeRequestRow {
  id: number;
  agency_id: number;
  submitted_by: number;
  rc: string | null;
  ninea: string | null;
  rib_pro: string | null;
  company_legal_name: string | null;
  address_fiscale: string | null;
  planned_agents_count: number | null;
  status: AgencyUpgradeRequestStatus;
  submitted_at: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string | null;
  updated_at: string | null;
  agency?: {
    id: number;
    name: string | null;
    slug: string | null;
    kind: string | null;
    status: string | null;
    created_at: string | null;
  } | null;
  submitter?: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export interface AdminAgencyUpgradeRequestDetail extends AdminAgencyUpgradeRequestRow {
  reviewer: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  documents: Array<{
    id: number;
    name: string | null;
    type: string | null;
    media_url: string | null;
  }>;
  counts: {
    properties: number;
    other_requests: number;
  };
}

export interface AdminAgencyUpgradeRequestListResponse {
  data: AdminAgencyUpgradeRequestRow[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
}

export async function fetchAdminAgencyUpgradeRequests(
  params: {
    status?: AgencyUpgradeRequestStatus | 'all';
    submittedFrom?: string;
    submittedTo?: string;
    page?: number;
    perPage?: number;
  } = {},
): Promise<AdminAgencyUpgradeRequestListResponse> {
  const qs = new URLSearchParams();
  qs.set(
    'fields[agency_upgrade_requests]',
    'id,agency_id,submitted_by,company_legal_name,planned_agents_count,status,submitted_at,reviewed_at,review_comment',
  );
  qs.set('include', 'agency,submitter');
  qs.set('sort', '-submitted_at');
  if (params.status && params.status !== 'all') qs.set('filter[status]', params.status);
  if (params.submittedFrom) qs.set('filter[submitted_from]', params.submittedFrom);
  if (params.submittedTo) qs.set('filter[submitted_to]', params.submittedTo);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));

  const res = await fetch(
    `/api/super-admin/agency-upgrade-requests?${qs.toString()}`,
    { credentials: 'include' },
  );
  return jsonOrThrow<AdminAgencyUpgradeRequestListResponse>(res);
}

export async function fetchAdminAgencyUpgradeRequest(
  requestId: number,
): Promise<AdminAgencyUpgradeRequestDetail> {
  const res = await fetch(`/api/super-admin/agency-upgrade-requests/${requestId}`, {
    credentials: 'include',
  });
  const json = await jsonOrThrow<{ data: AdminAgencyUpgradeRequestDetail }>(res);
  return json.data;
}

export async function fetchAdminAgencyUpgradePendingCount(): Promise<number> {
  const res = await fetch('/api/super-admin/agency-upgrade-requests/pending-count', {
    credentials: 'include',
  });
  const json = await jsonOrThrow<{ count: number }>(res);
  return json.count;
}

export async function approveAdminAgencyUpgradeRequest(
  requestId: number,
  comment: string | null,
): Promise<AdminAgencyUpgradeRequestRow> {
  const res = await fetch(
    `/api/super-admin/agency-upgrade-requests/${requestId}/approve`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: comment ?? '' }),
    },
  );
  const json = await jsonOrThrow<{ data: AdminAgencyUpgradeRequestRow }>(res);
  return json.data;
}

export async function rejectAdminAgencyUpgradeRequest(
  requestId: number,
  comment: string,
): Promise<AdminAgencyUpgradeRequestRow> {
  const res = await fetch(
    `/api/super-admin/agency-upgrade-requests/${requestId}/reject`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    },
  );
  const json = await jsonOrThrow<{ data: AdminAgencyUpgradeRequestRow }>(res);
  return json.data;
}
