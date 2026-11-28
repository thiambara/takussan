import { ApiError } from '@/lib/api';
import type { PlatformLevel } from '@/lib/platform-abilities';
import type { BulkFailure } from '@/types/agent-crm';
import type { AgencyUpgradeRequestStatus } from '@/types/agency-upgrade';
import type {
  AdminAgenciesResponse,
  AdminAgencyDetailResponse,
  AdminAgencyHealthResponse,
  AdminAgencyTeamResponse,
  KycDossierResponse,
  PlanPayload,
  PlanResponse,
  PlansResponse,
  AgencySubscriptionResponse,
  AdminPropertiesResponse,
  BusinessEnumsResponse,
  NotificationTemplateChannel,
  NotificationTemplateLocale,
  NotificationTemplatePreviewResponse,
  NotificationTemplateResponse,
  NotificationTemplatesResponse,
  PlatformSettingsResponse,
  PlatformSettingValue,
  AdminIntegrationsResponse,
  AdminIntegrationResponse,
  AdminIntegrationSchemaResponse,
  IntegrationTestResponse,
  IntegrationWebhooksResponse,
  PaymentSupervisionResponse,
  PaymentSummaryResponse,
  WebhookLog,
  WebhookLogsResponse,
  MaintenanceStatusResponse,
  MaintenanceMode,
  MaintenanceSeverity,
  AdminFeatureFlagsResponse,
  AlertRulesResponse,
  AlertRuleResponse,
  ModerationBatchResult,
  ModerationDecision,
  ModerationDecisionPayload,
  AgencyProvisioningResponse,
  AdminUserDetailResponse,
  AdminUserSessionsResponse,
  AuditLogResponse,
  SystemMetricsResponse,
  AnnouncementsResponse,
  AnnouncementPayload,
  AnnouncementSegment,
  DataExport,
  PlatformHealthResponse,
  FailedJobDetailResponse,
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
  SharedLegalIdentifiers,
  AdminAiDashboardResponse,
  AdminAiEvaluationResponse,
  AdminAiEvaluationSuiteResponse,
  AdminAiModelsResponse,
  AdminAiProvidersResponse,
  AdminAiRolesResponse,
  AdminAiUsagesResponse,
  AiModelLink,
  AiModelRole,
  AiModelPrices,
  AiProviderTestResponse,
} from '@/types/super-admin';
import { cheminApi, requete } from '@/lib/chemin-api';
import { appelBff } from '@/lib/bff';
import { KYC_DOSSIER_FIELDS } from '@/lib/queries/super-admin-coque';

/**
 * TCK-1202 (P104.05) — la recherche globale et les quatre lecteurs des files vivent dans
 * `super-admin-coque.ts` : la barre haute et la barre latérale de la console les montent sur
 * chaque écran, et importer ce module-ci y faisait entrer ses 96 exports, que le bundler n'élague
 * pas. Réexportés ici pour les écrans qui les prennent à ce module.
 */
export {
  fetchAdminAgencyUpgradePendingCount,
  fetchAdminKycQueue,
  fetchFailedJobs,
  fetchGlobalSearch,
  fetchModerationQueue,
  type GlobalSearchHit,
} from '@/lib/queries/super-admin-coque';


export async function fetchAdminAgencies(params: {
  status?: string;
  /**
   * TCK-390 — état de vérification. `undefined` = pas de filtre : c'est ce qui distingue
   * « toutes les agences » de « les non vérifiées », que `false` seul ne saurait dire.
   */
  isVerified?: boolean;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: 'created_at' | '-created_at' | 'name' | '-name' | 'members_count' | '-members_count' | 'properties_count' | '-properties_count';
  page?: number;
  perPage?: number;
} = {}): Promise<AdminAgenciesResponse> {
  return appelBff<AdminAgenciesResponse>('/api/super-admin/agencies', {
    params: {
      // P100.05 (TCK-1186) — `fields` inerte : `Admin\AgencyModerationController::index` est une liste écrite à la main.
      fields: { agencies: 'id,name,slug,status,is_verified,verified_at,primary_admin_id,license_number,email,phone,logo_url,properties_count,members_count,last_activity_at,created_at' },
      filter: {
        status: params.status,
        // TCK-390 — `'0'` et `'1'`, pas le booléen : `buildQueryString` écrirait `false`.
        is_verified: params.isVerified === undefined ? undefined : params.isVerified ? '1' : '0',
        search: params.search,
        created_from: params.createdFrom,
        created_to: params.createdTo,
      },
      sort: params.sort ?? '-created_at',
      // `0` n'est pas une page : l'ancien `if (params.page)` ne l'envoyait pas.
      page: params.page || undefined,
      per_page: params.perPage || undefined,
    },
  });
}

export async function fetchAdminAgencyDetail(agencyId: number): Promise<AdminAgencyDetailResponse> {
  const qs = new URLSearchParams();
  // P60.03 — pas de `fields[agencies]` : un `show` rend la ressource de détail entière.
  qs.set('include', 'primaryAdmin,address');
  return appelBff<AdminAgencyDetailResponse>(cheminApi`/api/super-admin/agencies/${agencyId}?${qs.toString()}`);
}

export async function fetchAdminAgencyHealth(agencyId: number): Promise<AdminAgencyHealthResponse> {
  return appelBff<AdminAgencyHealthResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/health`);
}

export async function fetchAdminAgencyTeam(agencyId: number): Promise<AdminAgencyTeamResponse> {
  const qs = new URLSearchParams();
  // TCK-278 — PAS d'`include=roles` : `roles` n'est plus une relation Eloquent
  // (spatie/laravel-permission est désinstallé) et cet endpoint est monté sur
  // `User::buildQuery()`, qui répond `400 InvalidIncludeQuery` sur un include
  // non déclaré. Le backend renvoie déjà `roles` dans le payload.
  qs.set('fields[users]', 'id,first_name,last_name,email,status,last_login_at');
  qs.set('per_page', '10');
  return appelBff<AdminAgencyTeamResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/team?${qs.toString()}`);
}

export async function fetchAdminAgencyProperties(agencyId: number): Promise<AdminPropertiesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[properties]', ADMIN_PROPERTY_FIELDS.join(','));
  qs.set('include', 'address,agency');
  qs.set('sort', '-created_at');
  qs.set('per_page', '8');
  return appelBff<AdminPropertiesResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/properties?${qs.toString()}`);
}


export async function fetchAdminAgencyKyc(agencyId: number): Promise<KycDossierResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[kyc_dossiers]', KYC_DOSSIER_FIELDS);
  qs.set('include', 'subject,reviewer');
  return appelBff<KycDossierResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/kyc?${qs.toString()}`);
}

export async function postKycReview(
  dossierId: number,
  action: 'verify' | 'reject',
  reason?: string,
): Promise<KycDossierResponse> {
  return appelBff<KycDossierResponse>(cheminApi`/api/super-admin/kyc/${dossierId}/${action}`, {
    method: 'POST',
    body: action === 'reject' ? { reason } : undefined,
  });
}

export async function fetchAdminPlans(): Promise<PlansResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[plans]', 'id,code,label,description,monthly_price_xof,platform_fee_pct,trial_days,limits,is_active,sort_order,created_at,updated_at');
  qs.set('sort', 'sort_order');
  return appelBff<PlansResponse>(cheminApi`/api/super-admin/plans?${qs.toString()}`);
}

export async function createAdminPlan(payload: Required<Pick<PlanPayload, 'code' | 'label' | 'monthly_price_xof' | 'platform_fee_pct'>> & PlanPayload): Promise<PlanResponse> {
  return appelBff<PlanResponse>('/api/super-admin/plans', { method: 'POST', body: payload });
}

export async function updateAdminPlan(planId: number, payload: PlanPayload): Promise<PlanResponse> {
  return appelBff<PlanResponse>(cheminApi`/api/super-admin/plans/${planId}`, { method: 'PATCH', body: payload });
}

export async function deleteAdminPlan(planId: number): Promise<unknown> {
  return appelBff<unknown>(cheminApi`/api/super-admin/plans/${planId}`, { method: 'DELETE' });
}

export async function fetchAdminAgencySubscription(agencyId: number): Promise<AgencySubscriptionResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agency_subscriptions]', 'id,agency_id,plan_id,status,trial_ends_at,current_period_start,current_period_end,ended_at,platform_fee_pct_override,limits_override,created_at,updated_at');
  qs.set('include', 'plan');
  return appelBff<AgencySubscriptionResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/subscription?${qs.toString()}`);
}

export async function assignAdminAgencySubscription(
  agencyId: number,
  payload: {
    plan_id: number;
    trial_ends_at?: string | null;
    overrides?: { platform_fee_pct?: number | null; limits?: Record<string, number> };
  },
): Promise<AgencySubscriptionResponse> {
  return appelBff<AgencySubscriptionResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/subscription`, { method: 'POST', body: payload });
}

/**
 * TCK-2222 (P214.01) — les dérogations de l'abonnement ouvert, modifiées sur place : ni le plan,
 * ni l'essai, ni la période ne changent. Une valeur `null` retire la dérogation.
 */
export async function updateAdminAgencySubscriptionOverrides(
  agencyId: number,
  payload: {
    platform_fee_pct: number | null;
    limits: { max_active_listings: number | null; max_agents: number | null; max_branches: number | null };
  },
): Promise<AgencySubscriptionResponse> {
  return appelBff<AgencySubscriptionResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/subscription/overrides`, { method: 'PATCH', body: payload });
}

export async function cancelAdminAgencySubscription(agencyId: number): Promise<AgencySubscriptionResponse> {
  return appelBff<AgencySubscriptionResponse>(cheminApi`/api/super-admin/agencies/${agencyId}/subscription/cancel`, { method: 'POST' });
}

export type AgencyModerationAction = 'verify' | 'suspend' | 'unverify' | 'reinstate';

/**
 * TCK-600 (ADR-0048) — `suspend` et `reinstate` exigent un motif (422 sans) : il part dans le
 * corps, l'API le journalise et le transmet aux admins de l'agence.
 */
export async function postAgencyAction(
  agencyId: number,
  action: AgencyModerationAction,
  reason?: string,
): Promise<unknown> {
  return appelBff<unknown>(cheminApi`/api/super-admin/agencies/${agencyId}/${action}`, { method: 'POST', body: reason ? { reason } : {} });
}

export type AgencyOnboardingPayload = {
  agency: {
    name: string;
    slug?: string;
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
    /**
     * P251.02 (TCK-2365) — facultatif : cherché parmi les numéros vérifiés, il fait refuser la
     * création en 409 (`agency.admin_phone_taken`) quand un compte le porte déjà.
     */
    phone?: string;
    language?: 'fr' | 'en' | 'wo';
  };
};

export async function postAgencyOnboarding(
  payload: AgencyOnboardingPayload,
): Promise<AgencyProvisioningResponse> {
  return appelBff<AgencyProvisioningResponse>('/api/super-admin/agencies', { method: 'POST', body: payload });
}

export async function fetchSystemMetrics(): Promise<SystemMetricsResponse> {
  return appelBff<SystemMetricsResponse>('/api/super-admin/system/metrics');
}

export async function fetchAdminUserDetail(userId: number): Promise<AdminUserDetailResponse> {
  // P60.03 — ni `fields[users]` ni `include` : un `show` rend la ressource de détail entière.
  return appelBff<AdminUserDetailResponse>(cheminApi`/api/super-admin/users/${userId}`);
}

export async function fetchAdminUserSessions(userId: number): Promise<AdminUserSessionsResponse> {
  const qs = new URLSearchParams();
  // P100.05 (TCK-1186) — `fields` inerte : `Admin\UserDetailController::sessions` est une liste écrite à la main.
  qs.set('fields[personal_access_tokens]', 'id,name,last_used_at,created_at,expires_at');
  qs.set('per_page', '20');
  return appelBff<AdminUserSessionsResponse>(cheminApi`/api/super-admin/users/${userId}/sessions?${qs.toString()}`);
}

export async function fetchAdminUserActivity(userId: number): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  qs.set('sort', '-created_at');
  qs.set('per_page', '20');
  return appelBff<AuditLogResponse>(cheminApi`/api/super-admin/users/${userId}/activity?${qs.toString()}`);
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
  return appelBff<{ success: true; action_id: number }>(cheminApi`/api/super-admin/users/${userId}/${action}`, { method: 'POST', body: { reason } });
}

export type UserLifecycleAction = 'block' | 'reactivate' | 'erase';

/**
 * TCK-600 — bloquer / réactiver (`support`), effacer (`super_admin`, 202 : effacement PLANIFIÉ au
 * délai de grâce). Le motif est requis par l'API.
 */
export async function postUserLifecycleAction(
  userId: number,
  action: UserLifecycleAction,
  reason: string,
): Promise<{ data: unknown }> {
  return appelBff<{ data: unknown }>(cheminApi`/api/super-admin/users/${userId}/${action}`, { method: 'POST', body: { reason } });
}

export async function deleteAdminUserSession(
  userId: number,
  tokenId: number,
  reason: string,
): Promise<{ success: true; action_id: number }> {
  return appelBff<{ success: true; action_id: number }>(cheminApi`/api/super-admin/users/${userId}/sessions/${tokenId}`, { method: 'DELETE', body: { reason } });
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
 *   · les seules clés qu'il lit hors colonnes sont `location` et `agency` (`status_label` en est
 *     sorti avec TCK-351 : le statut se traduit par `property.status` du front).
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
  /** P167.07 (TCK-2087) — « publiés » au sens du catalogue : `filter[public]=1` (TCK-2036). */
  readonly public?: boolean;
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
  if (params.public) qs.set('filter[public]', '1');
  if (typeof params.agencyId === 'number') qs.set('filter[agency_id]', String(params.agencyId));
  qs.set('sort', params.sort ?? '-created_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));

  return appelBff<AdminPropertiesResponse>(cheminApi`/api/super-admin-properties?${qs.toString()}`);
}

export async function postPropertyAction(
  propertyId: number,
  action: 'publish' | 'unpublish',
): Promise<unknown> {
  return appelBff<unknown>(cheminApi`/api/super-admin-properties/${propertyId}/${action}`, { method: 'POST' });
}

/** TCK-952 — `failed` est la liste des refus `{ id, reason }` de `PropertyBulkArchiveService`. */
type ArchivageEnMasse = { archived: number; failed: BulkFailure[]; archived_ids: number[] };

export async function archiveProperties(
  propertyIds: number[],
  reason?: string,
): Promise<ArchivageEnMasse> {
  return appelBff<ArchivageEnMasse>('/api/super-admin-properties/bulk-archive', { method: 'POST', body: { property_ids: propertyIds, reason } });
}

export async function deleteProperty(propertyId: number): Promise<unknown> {
  return appelBff<unknown>(cheminApi`/api/super-admin-properties/${propertyId}`, { method: 'DELETE' });
}

export interface AuditLogFilterParams {
  event?: string;
  causerId?: number;
  subjectType?: string;
  dateFrom?: string;
  dateTo?: string;
  /**
   * TCK-601 — préréglage « Gestes sensibles » (`filter[sensitive]=1`) : consultations de données
   * personnelles, registre des droits, sécurité, support, KYC, rôles, intégrations, exports. La
   * liste des journaux vit côté API, nommée en constante ; le front ne la recopie pas.
   */
  sensitive?: boolean;
}

/** Les filtres de l'audit plateforme, sérialisés À L'IDENTIQUE pour la liste et pour l'export. */
function auditFilterQuery(params: AuditLogFilterParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.event) qs.set('filter[event]', params.event);
  if (params.causerId) qs.set('filter[causer_id]', String(params.causerId));
  if (params.subjectType) qs.set('filter[subject_type]', params.subjectType);
  if (params.dateFrom) qs.set('filter[date_from]', params.dateFrom);
  if (params.dateTo) qs.set('filter[date_to]', params.dateTo);
  if (params.sensitive) qs.set('filter[sensitive]', '1');
  return qs;
}

export async function fetchAuditLog(params: AuditLogFilterParams & {
  page?: number;
  perPage?: number;
} = {}): Promise<AuditLogResponse> {
  return appelBff<AuditLogResponse>(cheminApi`/api/super-admin/audit?${requeteJournalAudit(params).toString()}`);
}

/** TCK-1828 — la requête du journal d'audit, lue par le navigateur et par l'accueil serveur. */
export function requeteJournalAudit(params: AuditLogFilterParams & {
  page?: number;
  perPage?: number;
} = {}): URLSearchParams {
  const qs = auditFilterQuery(params);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  qs.set('include', 'causer');
  return qs;
}

/** TCK-601 — un export CSV de l'audit plateforme : un lien signé, à ouvrir avant `expires_at`. */
export interface AuditLogExport {
  readonly url: string;
  readonly expires_at: string;
  readonly count: number;
}

/**
 * TCK-601 — `GET /api/admin/audit/export?<mêmes filtres que la liste>`. L'API rend un lien signé
 * vers le CSV (et journalise l'export lui-même) ; c'est à l'appelant de l'ouvrir.
 */
export async function exportAuditLog(params: AuditLogFilterParams = {}): Promise<AuditLogExport> {
  const qs = auditFilterQuery(params).toString();
  const json = await appelBff<{ data: AuditLogExport }>(cheminApi`/api/super-admin/audit/export${requete(qs)}`);
  return json.data;
}

/** Le chemin signé que l'API rend pour le fichier de l'audit de la console (TCK-613). */
const CHEMIN_SIGNE_DE_L_AUDIT = '/api/admin/audit/export/download?';

/**
 * TCK-613 (ADR-0044 §2) — télécharge le CSV de l'audit plateforme. Le lien n'est plus un droit au
 * porteur : l'API rend un chemin signé RELATIF, servi au seul opérateur qui l'a demandé et sous sa
 * session. Il passe par le relais `/api/super-admin/*` (jeton de l'opérateur), sa requête intacte —
 * la signature se recalcule sur la chaîne brute — puis est enregistré par un `<a download>`.
 */
export async function downloadAuditLogExport(url: string): Promise<string> {
  if (!url.startsWith(CHEMIN_SIGNE_DE_L_AUDIT)) {
    throw new ApiError(400, { code: 'activity_log.export_link_invalid' });
  }
  const res = await fetch(cheminApi`/api/super-admin/audit/export/download${requete(url.slice(CHEMIN_SIGNE_DE_L_AUDIT.length))}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }
  const filename = filenameFromDisposition(res.headers.get('content-disposition') ?? '') ?? 'audit-plateforme.csv';
  triggerDownload(await res.blob(), filename);
  return filename;
}

export async function postModerationDecision(
  itemId: string,
  payload: ModerationDecisionPayload,
): Promise<{ data: { id: string; decision: ModerationDecision; subject_type: string; subject_id: number } }> {
  return appelBff<{ data: { id: string; decision: ModerationDecision; subject_type: string; subject_id: number } }>(cheminApi`/api/super-admin/moderation/${itemId}/decide`, { method: 'POST', body: payload });
}

/** TCK-597 (ADR-0043 §7) — une décision et un motif communs à au plus 50 éléments ; un résultat par élément. */
export async function postModerationDecisionBatch(
  ids: string[],
  payload: ModerationDecisionPayload,
): Promise<{ data: ModerationBatchResult[] }> {
  return appelBff<{ data: ModerationBatchResult[] }>('/api/super-admin/moderation/decide-batch', { method: 'POST', body: { ids, ...payload } });
}

/** TCK-597 — prendre l'élément en charge pour dix minutes ; tenu par un autre : 409. */
export async function claimModerationItem(
  itemId: string,
): Promise<{ data: { id: string; by: { id: number; name: string | null }; claimed_at: string; expires_at: string } }> {
  return appelBff(cheminApi`/api/super-admin/moderation/${itemId}/claim`, { method: 'POST' });
}

/** TCK-597 — rendre sa prise. L'API répond 204, sans corps. */
export async function releaseModerationItem(itemId: string): Promise<void> {
  await appelBff<null>(cheminApi`/api/super-admin/moderation/${itemId}/claim`, { method: 'DELETE' });
}

export async function fetchBusinessEnums(): Promise<BusinessEnumsResponse> {
  return appelBff<BusinessEnumsResponse>('/api/super-admin/enums');
}

export async function fetchNotificationTemplates(): Promise<NotificationTemplatesResponse> {
  return appelBff<NotificationTemplatesResponse>('/api/super-admin/notification-templates');
}

export async function patchNotificationTemplate(
  event: string,
  channel: NotificationTemplateChannel,
  payload: {
    is_active: boolean;
    templates: Record<NotificationTemplateLocale, { subject?: string | null; body: string }>;
  },
): Promise<NotificationTemplateResponse> {
  return appelBff<NotificationTemplateResponse>(cheminApi`/api/super-admin/notification-templates/${event}/${channel}`, { method: 'PATCH', body: payload });
}

export async function previewNotificationTemplate(
  event: string,
  channel: NotificationTemplateChannel,
  locale: NotificationTemplateLocale,
): Promise<NotificationTemplatePreviewResponse> {
  return appelBff<NotificationTemplatePreviewResponse>(cheminApi`/api/super-admin/notification-templates/${event}/${channel}/preview`, { method: 'POST', body: { locale } });
}

export async function fetchPlatformSettings(): Promise<PlatformSettingsResponse> {
  return appelBff<PlatformSettingsResponse>('/api/super-admin/settings');
}

export async function patchPlatformSettings(
  payload: Record<string, PlatformSettingValue>,
): Promise<PlatformSettingsResponse> {
  return appelBff<PlatformSettingsResponse>('/api/super-admin/settings', { method: 'PATCH', body: payload });
}

export async function fetchAdminIntegrations(): Promise<AdminIntegrationsResponse> {
  return appelBff<AdminIntegrationsResponse>('/api/super-admin/integrations');
}

export async function fetchAdminIntegrationSchema(id: number): Promise<AdminIntegrationSchemaResponse> {
  return appelBff<AdminIntegrationSchemaResponse>(cheminApi`/api/super-admin/integrations/${id}/schema`);
}

export async function patchAdminIntegration(
  id: number,
  payload: { credentials?: Record<string, string>; is_active?: boolean; metadata?: Record<string, unknown> },
): Promise<AdminIntegrationResponse> {
  return appelBff<AdminIntegrationResponse>(cheminApi`/api/super-admin/integrations/${id}`, { method: 'PATCH', body: payload });
}

export async function testAdminIntegration(id: number): Promise<IntegrationTestResponse> {
  return appelBff<IntegrationTestResponse>(cheminApi`/api/super-admin/integrations/${id}/test`, { method: 'POST' });
}

export async function fetchIntegrationWebhooks(id: number): Promise<IntegrationWebhooksResponse> {
  return appelBff<IntegrationWebhooksResponse>(cheminApi`/api/super-admin/integrations/${id}/webhooks`);
}

// ─── TCK-602 — console « Paiements » et journal des webhooks ───────────────────────────────

export type PaymentSupervisionFilters = {
  status?: 'failed' | 'late' | 'refund_due';
  provider?: string;
  page?: number;
  perPage?: number;
};

export async function fetchPaymentSupervision(filters: PaymentSupervisionFilters = {}): Promise<PaymentSupervisionResponse> {
  const qs = new URLSearchParams();
  qs.set('per_page', String(filters.perPage ?? 20));
  if (filters.page) qs.set('page', String(filters.page));
  if (filters.status) qs.set('filter[status]', filters.status);
  if (filters.provider) qs.set('filter[provider]', filters.provider);
  return appelBff<PaymentSupervisionResponse>(cheminApi`/api/super-admin/payments${requete(qs)}`);
}

export async function fetchPaymentSummary(): Promise<PaymentSummaryResponse> {
  return appelBff<PaymentSummaryResponse>('/api/super-admin/payments/summary');
}

export type WebhookLogFilters = {
  channel?: string;
  status?: string;
  unmatched?: boolean;
  page?: number;
  perPage?: number;
};

/** Les seules colonnes que la table lit — jamais `body` ni `headers`, que l'API refuse. */
const WEBHOOK_LOG_FIELDS =
  'id,channel,provider,status,event_type,http_status,error_code,external_id,matched_count,attempts,authenticated_at,body_truncated,replayed_at,created_at';

export async function fetchWebhookLogs(filters: WebhookLogFilters = {}): Promise<WebhookLogsResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[integration_webhook_logs]', WEBHOOK_LOG_FIELDS);
  qs.set('per_page', String(filters.perPage ?? 20));
  if (filters.page) qs.set('page', String(filters.page));
  if (filters.channel) qs.set('filter[channel]', filters.channel);
  if (filters.status) qs.set('filter[status]', filters.status);
  if (filters.unmatched) qs.set('filter[unmatched]', '1');
  return appelBff<WebhookLogsResponse>(cheminApi`/api/super-admin/webhook-logs${requete(qs)}`);
}

export async function replayWebhookLog(id: number): Promise<{ data: WebhookLog }> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError(String(id));
  return appelBff<{ data: WebhookLog }>(cheminApi`/api/super-admin/webhook-logs/${id}/replay`, { method: 'POST' });
}

export async function fetchMaintenance(): Promise<MaintenanceStatusResponse> {
  return appelBff<MaintenanceStatusResponse>('/api/super-admin/maintenance');
}

export async function scheduleMaintenance(payload: {
  starts_at: string;
  ends_at: string;
  mode: MaintenanceMode;
  severity: MaintenanceSeverity;
  messages: { fr: string; en?: string; wo?: string };
  banner_lead_minutes?: number;
}): Promise<MaintenanceStatusResponse> {
  return appelBff<MaintenanceStatusResponse>('/api/super-admin/maintenance', { method: 'POST', body: payload });
}

export async function cancelMaintenance(): Promise<MaintenanceStatusResponse> {
  return appelBff<MaintenanceStatusResponse>('/api/super-admin/maintenance', { method: 'DELETE' });
}

export async function fetchAdminFeatureFlags(): Promise<AdminFeatureFlagsResponse> {
  return appelBff<AdminFeatureFlagsResponse>('/api/super-admin/feature-flags');
}

export async function patchAdminFeatureFlag(
  key: string,
  payload: { enabled: boolean; segments?: { roles?: string[]; agency_ids?: number[]; rollout_percentage?: number } },
): Promise<AdminFeatureFlagsResponse> {
  return appelBff<AdminFeatureFlagsResponse>(cheminApi`/api/super-admin/feature-flags/${key}`, { method: 'PATCH', body: payload });
}

export async function overrideAdminFeatureFlag(key: string, enabled: boolean): Promise<{ data: { key: string; enabled: boolean } }> {
  return appelBff<{ data: { key: string; enabled: boolean } }>(cheminApi`/api/super-admin/feature-flags/${key}/override`, { method: 'POST', body: { enabled } });
}

export async function fetchAlertRules(): Promise<AlertRulesResponse> {
  return appelBff<AlertRulesResponse>('/api/super-admin/alert-rules');
}

export async function createAlertRule(payload: {
  event: string;
  channels: string[];
  recipients: { emails?: string[]; webhooks?: string[] };
  is_active: boolean;
}): Promise<AlertRuleResponse> {
  return appelBff<AlertRuleResponse>('/api/super-admin/alert-rules', { method: 'POST', body: payload });
}

export async function patchAlertRule(
  id: number,
  payload: Partial<{ event: string; channels: string[]; recipients: { emails?: string[]; webhooks?: string[] }; is_active: boolean }>,
): Promise<AlertRuleResponse> {
  return appelBff<AlertRuleResponse>(cheminApi`/api/super-admin/alert-rules/${id}`, { method: 'PATCH', body: payload });
}

export async function deleteAlertRule(id: number): Promise<unknown> {
  return appelBff<unknown>(cheminApi`/api/super-admin/alert-rules/${id}`, { method: 'DELETE' });
}

export async function testAlertRule(id: number): Promise<{ data: { queued: boolean } }> {
  return appelBff<{ data: { queued: boolean } }>(cheminApi`/api/super-admin/alert-rules/${id}/test`, { method: 'POST' });
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

  return appelBff<AnnouncementsResponse>(cheminApi`/api/super-admin/announcements?${qs.toString()}`);
}

export async function createAdminAnnouncement(payload: AnnouncementPayload): Promise<{ data: AnnouncementPayload & { id: number } }> {
  return appelBff<{ data: AnnouncementPayload & { id: number } }>('/api/super-admin/announcements', { method: 'POST', body: payload });
}

export async function patchAdminAnnouncement(
  id: number,
  payload: Partial<AnnouncementPayload> & { segment?: AnnouncementSegment },
): Promise<{ data: AnnouncementPayload & { id: number } }> {
  return appelBff<{ data: AnnouncementPayload & { id: number } }>(cheminApi`/api/super-admin/announcements/${id}`, { method: 'PATCH', body: payload });
}

export async function deactivateAdminAnnouncement(id: number): Promise<{ data: AnnouncementPayload & { id: number } }> {
  return appelBff<{ data: AnnouncementPayload & { id: number } }>(cheminApi`/api/super-admin/announcements/${id}/deactivate`, { method: 'POST' });
}

export async function requestAdminUserDataExport(
  userId: number,
  reason: 'support' | 'legal_request' | 'user_inquiry' | 'other',
): Promise<{ data: DataExport }> {
  return appelBff<{ data: DataExport }>(cheminApi`/api/super-admin/users/${userId}/data-exports`, { method: 'POST', body: { reason } });
}

export async function fetchPlatformHealth(): Promise<PlatformHealthResponse> {
  return appelBff<PlatformHealthResponse>('/api/super-admin/health');
}

/**
 * Le détail d'un job, chargé À LA DEMANDE (TCK-365).
 *
 * La liste tronque `payload` et `exception` à 1024 caractères CÔTÉ SERVEUR : déplier une ligne
 * déjà reçue ne rendrait donc jamais que la troncature. Seul cet appel rend la trace entière —
 * et c'est aussi pourquoi il n'est pas préchargé pour chaque ligne.
 */
export async function fetchFailedJob(id: number): Promise<FailedJobDetailResponse> {
  return appelBff<FailedJobDetailResponse>(cheminApi`/api/super-admin/jobs/failed/${id}`);
}

export async function retryFailedJob(id: number): Promise<{ data: { retried: boolean } }> {
  return appelBff<{ data: { retried: boolean } }>(cheminApi`/api/super-admin/jobs/failed/${id}/retry`, { method: 'POST' });
}

export async function deleteFailedJob(id: number): Promise<{ data: { deleted: boolean } }> {
  return appelBff<{ data: { deleted: boolean } }>(cheminApi`/api/super-admin/jobs/failed/${id}`, { method: 'DELETE' });
}

export async function retryAllFailedJobs(): Promise<{ data: { queued: number } }> {
  return appelBff<{ data: { queued: number } }>('/api/super-admin/jobs/failed/retry-all', { method: 'POST' });
}

export async function fetchScheduler(): Promise<SchedulerResponse> {
  return appelBff<SchedulerResponse>('/api/super-admin/scheduler');
}

// ─────────────────────────────────────────────────────────────────────────────
// TCK-223 — Platform payouts
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_PAYOUT_FIELDS =
  'id,agency_id,period_start,period_end,gross_amount,platform_fee_amount,net_amount,currency,status,closed_by_id,approved_by,approved_at,paid_by_id,payment_reference,processed_at,failure_reason,metadata,created_at,updated_at';

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
  return appelBff<PlatformPayoutsResponse>(cheminApi`/api/super-admin/payouts?${qs.toString()}`);
}

export async function fetchAdminPlatformPayout(payoutId: number): Promise<PlatformPayoutResponse> {
  return appelBff<PlatformPayoutResponse>(cheminApi`/api/super-admin/payouts/${payoutId}`);
}

export async function closeAdminPlatformPayoutPeriod(payload: {
  agency_id?: number | null;
  period_end: string;
}): Promise<PlatformPayoutClosePeriodResponse> {
  return appelBff<PlatformPayoutClosePeriodResponse>('/api/super-admin/payouts/close-period', { method: 'POST', body: payload });
}

export async function approveAdminPlatformPayout(payoutId: number): Promise<PlatformPayoutResponse> {
  return appelBff<PlatformPayoutResponse>(cheminApi`/api/super-admin/payouts/${payoutId}/approve`, { method: 'POST' });
}

export async function markAdminPlatformPayoutPaid(
  payoutId: number,
  // TCK-594 (ADR-0039 §4) — l'argent parti se prouve : `payment_reference` est exigé par l'API.
  payload: { processed_at: string; payment_reference: string; metadata?: { bank_ref?: string; batch_id?: string } },
): Promise<PlatformPayoutResponse> {
  return appelBff<PlatformPayoutResponse>(cheminApi`/api/super-admin/payouts/${payoutId}/mark-paid`, { method: 'POST', body: payload });
}

export async function cancelAdminPlatformPayout(
  payoutId: number,
  reason: string,
): Promise<PlatformPayoutResponse> {
  return appelBff<PlatformPayoutResponse>(cheminApi`/api/super-admin/payouts/${payoutId}/cancel`, { method: 'POST', body: { reason } });
}

export async function fetchMyPlatformPayouts(): Promise<PlatformPayoutsResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[platform_payouts]', PLATFORM_PAYOUT_FIELDS);
  qs.set('sort', '-period_end');
  qs.set('per_page', '20');
  return appelBff<PlatformPayoutsResponse>(cheminApi`/api/me/payouts?${qs.toString()}`);
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
  return appelBff<GrowthResponse>(cheminApi`/api/super-admin/reports/growth?${qs.toString()}`);
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
  return appelBff<RevenueResponse>(cheminApi`/api/super-admin/reports/revenue?${qs.toString()}`);
}

export async function fetchAdminReportCohorts(params: { depth?: number } = {}): Promise<CohortsResponse> {
  const qs = new URLSearchParams();
  if (params.depth) qs.set('depth', String(params.depth));
  return appelBff<CohortsResponse>(cheminApi`/api/super-admin/reports/cohorts?${qs.toString()}`);
}

export async function fetchAdminReportFunnel(params: { period?: ReportPeriod } = {}): Promise<FunnelResponse> {
  const qs = new URLSearchParams();
  if (params.period) qs.set('period', params.period);
  return appelBff<FunnelResponse>(cheminApi`/api/super-admin/reports/funnel?${qs.toString()}`);
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
  const res = await fetch(cheminApi`/api/super-admin/reports/${report}/export?${qs.toString()}`, { credentials: 'include' });
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
  /** TCK-600 (ADR-0047) — le niveau de l'opérateur. */
  level: PlatformLevel | null;
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
  /**
   * TCK-367 — calculé par le backend, jamais déduit ici : une invitation
   * encore `sent` dont `expires_at` est passé EST expirée, et le cron qui
   * bascule le statut ne tourne qu'à l'heure. Rejouer ce calcul côté client
   * le ferait dépendre de l'horloge du navigateur.
   */
  is_expired: boolean;
  metadata: Record<string, unknown> | null;
}

export interface SuperAdminCooptationListing {
  super_admins: SuperAdminEntry[];
  pending_invitations: SuperAdminPendingInvitation[];
}

export async function fetchSuperAdminListing(): Promise<SuperAdminCooptationListing> {
  const json = await appelBff<{ data: SuperAdminCooptationListing }>('/api/super-admin/super-admins');
  return json.data;
}

export async function inviteSuperAdmin(payload: {
  email: string;
  first_name: string;
  last_name: string;
  /** TCK-600 — le niveau du coopté (l'API retient `super_admin` sans lui). */
  level?: PlatformLevel;
}): Promise<SuperAdminPendingInvitation> {
  const json = await appelBff<{ data: SuperAdminPendingInvitation }>('/api/super-admin/super-admins/invite', { method: 'POST', body: payload });
  return json.data;
}

/**
 * TCK-367 — relance d'une invitation de cooptation.
 *
 * Réémet l'invitation EXISTANTE (nouveau token, expiration repoussée) :
 * ne jamais rappeler `inviteSuperAdmin` pour relancer, cela créerait une
 * seconde ligne — et le backend répondrait 409.
 */
export async function resendSuperAdminInvitation(
  invitationId: number,
): Promise<SuperAdminPendingInvitation> {
  const json = await appelBff<{ data: SuperAdminPendingInvitation }>(cheminApi`/api/super-admin/super-admins/invitations/${invitationId}/resend`, { method: 'POST' });
  return json.data;
}

/**
 * TCK-600 (ADR-0047) — retirer un opérateur : profil révoqué, jetons supprimés, sessions
 * d'impersonation fermées, pairs alertés. Motif requis.
 */
export async function revokePlatformOperator(userId: number, reason: string): Promise<unknown> {
  return appelBff<unknown>(cheminApi`/api/super-admin/super-admins/${userId}/revoke`, { method: 'POST', body: { reason } });
}

/** TCK-367 — annulation d'une invitation de cooptation. */
export async function revokeSuperAdminInvitation(
  invitationId: number,
): Promise<SuperAdminPendingInvitation> {
  const json = await appelBff<{ data: SuperAdminPendingInvitation }>(cheminApi`/api/super-admin/super-admins/invitations/${invitationId}/revoke`, { method: 'POST' });
  return json.data;
}

/* ------------------------------------------------------------------ */
/* TCK-268 — Agency upgrade review console                            */
/* ------------------------------------------------------------------ */

// TCK-1270 (P146.05) — déclaré une seule fois, dans `types/agency-upgrade.ts`.
export type { AgencyUpgradeRequestStatus } from '@/types/agency-upgrade';

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
    /** TCK-1003 — état du dossier KYC de l'agence (détail seulement) ; `null` sans dossier. */
    kyc_status?: string | null;
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
  /**
   * TCK-601 — les autres agences qui portent le même NINEA / RIB pro (super-admin seulement ;
   * absent sinon). Un signal pour la revue, jamais un refus.
   */
  shared_identifiers?: SharedLegalIdentifiers;
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

  return appelBff<AdminAgencyUpgradeRequestListResponse>(cheminApi`/api/super-admin/agency-upgrade-requests?${qs.toString()}`);
}

export async function fetchAdminAgencyUpgradeRequest(
  requestId: number,
): Promise<AdminAgencyUpgradeRequestDetail> {
  const json = await appelBff<{ data: AdminAgencyUpgradeRequestDetail }>(cheminApi`/api/super-admin/agency-upgrade-requests/${requestId}`);
  return json.data;
}

export async function approveAdminAgencyUpgradeRequest(
  requestId: number,
  comment: string | null,
): Promise<AdminAgencyUpgradeRequestRow> {
  const json = await appelBff<{ data: AdminAgencyUpgradeRequestRow }>(cheminApi`/api/super-admin/agency-upgrade-requests/${requestId}/approve`, { method: 'POST', body: { comment: comment ?? '' } });
  return json.data;
}

export async function rejectAdminAgencyUpgradeRequest(
  requestId: number,
  comment: string,
): Promise<AdminAgencyUpgradeRequestRow> {
  const json = await appelBff<{ data: AdminAgencyUpgradeRequestRow }>(cheminApi`/api/super-admin/agency-upgrade-requests/${requestId}/reject`, { method: 'POST', body: { comment } });
  return json.data;
}

// TCK-2385 (ADR-0076 §12) — la console IA. Aucune de ces routes ne rend ni n'accepte une clé.
export async function fetchAdminAiRoles(): Promise<AdminAiRolesResponse> {
  return appelBff<AdminAiRolesResponse>('/api/super-admin/ai/roles');
}

export async function putAdminAiRole(role: AiModelRole, chain: AiModelLink[], overrideReason?: string): Promise<AdminAiRolesResponse> {
  return appelBff<AdminAiRolesResponse>(cheminApi`/api/super-admin/ai/roles/${role}`, { method: 'PUT', body: { chain, ...(overrideReason ? { override_reason: overrideReason } : {}) } });
}

export async function deleteAdminAiRole(role: AiModelRole): Promise<AdminAiRolesResponse> {
  return appelBff<AdminAiRolesResponse>(cheminApi`/api/super-admin/ai/roles/${role}`, { method: 'DELETE' });
}

export async function fetchAdminAiUsages(): Promise<AdminAiUsagesResponse> {
  return appelBff<AdminAiUsagesResponse>('/api/super-admin/ai/usages');
}

export async function patchAdminAiUsage(
  key: string,
  payload: { enabled?: boolean; forced_provider?: string | null; forced_model?: string | null; daily_budget_usd?: string | null },
): Promise<AdminAiUsagesResponse> {
  return appelBff<AdminAiUsagesResponse>(cheminApi`/api/super-admin/ai/usages/${key}`, { method: 'PATCH', body: payload });
}

export async function fetchAdminAiModels(): Promise<AdminAiModelsResponse> {
  return appelBff<AdminAiModelsResponse>('/api/super-admin/ai/models');
}

export async function postAdminAiModel(payload: AiModelPrices & { provider: string; model: string; active?: boolean }): Promise<AdminAiModelsResponse> {
  return appelBff<AdminAiModelsResponse>('/api/super-admin/ai/models', { method: 'POST', body: payload });
}

export async function patchAdminAiModel(id: number, payload: Partial<AiModelPrices> & { active?: boolean }): Promise<AdminAiModelsResponse> {
  return appelBff<AdminAiModelsResponse>(cheminApi`/api/super-admin/ai/models/${id}`, { method: 'PATCH', body: payload });
}

/** Efface la ligne qui remplace un modèle de la configuration : le tarif de la configuration s'applique de nouveau. */
export async function deleteAdminAiModel(id: number): Promise<AdminAiModelsResponse> {
  return appelBff<AdminAiModelsResponse>(cheminApi`/api/super-admin/ai/models/${id}`, { method: 'DELETE' });
}

export async function fetchAdminAiProviders(): Promise<AdminAiProvidersResponse> {
  return appelBff<AdminAiProvidersResponse>('/api/super-admin/ai/providers');
}

export async function testAdminAiProvider(provider: string): Promise<AiProviderTestResponse> {
  return appelBff<AiProviderTestResponse>(cheminApi`/api/super-admin/ai/providers/${provider}/test`, { method: 'POST' });
}

export async function postAdminAiEvaluation(payload: { role: AiModelRole; provider: string; model: string; max_tokens?: number | null }): Promise<AdminAiEvaluationResponse> {
  return appelBff<AdminAiEvaluationResponse>('/api/super-admin/ai/evaluations', { method: 'POST', body: payload });
}

/** TCK-2459 — la dernière évaluation complète, `null` s'il n'y en a jamais eu. */
export async function fetchAdminAiEvaluationSuite(): Promise<AdminAiEvaluationSuiteResponse> {
  return appelBff<AdminAiEvaluationSuiteResponse>('/api/super-admin/ai/evaluations/suite');
}

/** TCK-2459 — lance l'évaluation complète : de vrais appels, à la charge du compte. */
export async function postAdminAiEvaluationSuite(): Promise<AdminAiEvaluationResponse> {
  return appelBff<AdminAiEvaluationResponse>('/api/super-admin/ai/evaluations/suite', { method: 'POST' });
}

export async function fetchAdminAiEvaluation(id: number): Promise<AdminAiEvaluationResponse> {
  return appelBff<AdminAiEvaluationResponse>(cheminApi`/api/super-admin/ai/evaluations/${id}`);
}

export async function fetchAdminAiDashboard(from: string, to: string): Promise<AdminAiDashboardResponse> {
  const qs = new URLSearchParams({ from, to });
  return appelBff<AdminAiDashboardResponse>(cheminApi`/api/super-admin/ai/dashboard${requete(qs)}`);
}
