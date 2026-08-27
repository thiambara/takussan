import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type {
  Integration,
  IntegrationTestResult,
  Setting,
  SettingScope,
  SettingValue,
} from '@/types/setting';
import type { IntegrationFormPayload } from '@/lib/schemas/setting';

/**
 * Settings & Integrations admin queries — TCK-023 / TCK-068.
 *
 * ⚠️ **`activeProfileId` traverse TOUTES les fonctions de ce module, et ce
 * n'est pas du confort.**
 *
 * `apiRequest` ne lit pas le cookie lui-même : il reçoit `activeProfileId` en
 * paramètre et ne pose l'en-tête `X-Active-Profile-Hint` que s'il l'a. Sans
 * cet en-tête, `ResolveActiveProfile` refuse la bascule automatique pour un
 * utilisateur MULTI-AGENCES — une agence active se choisit, elle ne se devine
 * pas — et `user.agency_id` reste `null` côté serveur.
 *
 * Or les cinq endpoints servis ici en dépendent tous, à la ligne :
 *
 * ```php
 * // IntegrationController::index
 * abort_unless($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id), 403);
 * // SettingController::index
 * abort_unless($user->agency_id, 403);
 * ```
 *
 * MESURÉ par test API le 2026-08-27 : un `agency_admin` multi-agences appelant
 * `/api/integrations` sans le hint reçoit **403**, et l'écran rend un
 * `ErrorState` — un chemin de navigation dont la destination ne contient pas
 * ce qu'elle annonce. Le défaut était inoffensif tant que seul un super-admin
 * (qui court-circuite le test `agency_id`) atteignait ces écrans ; TCK-370, en
 * ouvrant l'entrée « Intégrations » aux `agency_admin`, en a fait un chemin
 * promis.
 *
 * *L'agence est la frontière d'isolation : une capacité se juge pour un couple
 * (utilisateur, agence). Une requête qui ne dit pas de quelle agence elle parle
 * ne pose pas une question à laquelle le serveur puisse répondre.*
 *
 * Les ÉCRITURES le portent pour la même raison, pas une moindre : `store`,
 * `update`, `destroy` et `test` comparent tous `$user->agency_id` à l'agence de
 * la ressource. Le patron est celui de `lib/queries/agencies.ts`, dont
 * l'en-tête porte l'histoire complète du défaut.
 */

export const SETTING_ADMIN_FIELDS = [
  'id',
  'key',
  'value',
  'scope',
  'scope_id',
  'updated_by_id',
  'updated_at',
] as const;

export const INTEGRATION_ADMIN_FIELDS = [
  'id',
  'provider',
  'agency_id',
  'is_active',
  'last_used_at',
  'metadata',
  'created_at',
  'updated_at',
] as const;

export interface FetchSettingsParams {
  readonly scope?: SettingScope;
  readonly search?: string;
  readonly page?: number;
  readonly perPage?: number;
}

function buildSettingsParams({
  scope,
  search,
  page,
  perPage,
}: FetchSettingsParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (scope) filter.scope = scope;
  if (search) filter.key = search;

  return {
    fields: { settings: SETTING_ADMIN_FIELDS },
    filter,
    sort: 'key',
    page: page ?? 1,
    per_page: perPage ?? 100,
  };
}

export async function fetchSettings(
  token: string,
  params: FetchSettingsParams = {},
  activeProfileId?: string,
): Promise<PaginatedResponse<Setting>> {
  const qs = buildQueryString(buildSettingsParams(params));
  return apiRequest<PaginatedResponse<Setting>>(`/api/settings${qs ? `?${qs}` : ''}`, {
    token,
    activeProfileId,
  });
}

export async function upsertSetting(
  token: string,
  payload: {
    key: string;
    scope: SettingScope;
    value: Record<string, unknown>;
    scope_id?: number | null;
  },
  activeProfileId?: string,
): Promise<Setting> {
  const res = await apiRequest<ApiResponse<Setting>>(`/api/settings`, {
    method: 'POST',
    body: payload,
    token,
    activeProfileId,
  });
  return res.data;
}

export async function updateSetting(
  token: string,
  settingId: number,
  value: Record<string, unknown>,
  activeProfileId?: string,
): Promise<Setting> {
  const res = await apiRequest<ApiResponse<Setting>>(`/api/settings/${settingId}`, {
    method: 'PATCH',
    body: { value },
    token,
    activeProfileId,
  });
  return res.data;
}

export async function deleteSetting(
  token: string,
  settingId: number,
  activeProfileId?: string,
): Promise<void> {
  await apiRequest<unknown>(`/api/settings/${settingId}`, {
    method: 'DELETE',
    token,
    activeProfileId,
  });
}

export interface FetchIntegrationsParams {
  readonly agencyId?: number;
  readonly provider?: string;
}

export async function fetchIntegrations(
  token: string,
  params: FetchIntegrationsParams = {},
  activeProfileId?: string,
): Promise<PaginatedResponse<Integration>> {
  const filter: Record<string, string | number> = {};
  if (params.agencyId) filter.agency_id = params.agencyId;
  if (params.provider) filter.provider = params.provider;
  const qs = buildQueryString({
    fields: { integrations: INTEGRATION_ADMIN_FIELDS },
    filter,
    sort: 'provider',
    per_page: 100,
  });
  return apiRequest<PaginatedResponse<Integration>>(
    `/api/integrations${qs ? `?${qs}` : ''}`,
    { token, activeProfileId },
  );
}

export async function createIntegration(
  token: string,
  payload: IntegrationFormPayload,
  activeProfileId?: string,
): Promise<Integration> {
  const res = await apiRequest<ApiResponse<Integration>>(`/api/integrations`, {
    method: 'POST',
    body: payload,
    token,
    activeProfileId,
  });
  return res.data;
}

export async function updateIntegration(
  token: string,
  integrationId: number,
  payload: Partial<IntegrationFormPayload>,
  activeProfileId?: string,
): Promise<Integration> {
  const res = await apiRequest<ApiResponse<Integration>>(
    `/api/integrations/${integrationId}`,
    {
      method: 'PATCH',
      body: payload,
      token,
      activeProfileId,
    },
  );
  return res.data;
}

export async function testIntegration(
  token: string,
  integrationId: number,
  activeProfileId?: string,
): Promise<IntegrationTestResult> {
  const res = await apiRequest<ApiResponse<IntegrationTestResult>>(
    `/api/integrations/${integrationId}/test`,
    { method: 'POST', token, activeProfileId },
  );
  return res.data;
}

export async function deleteIntegration(
  token: string,
  integrationId: number,
  activeProfileId?: string,
): Promise<void> {
  await apiRequest<unknown>(`/api/integrations/${integrationId}`, {
    method: 'DELETE',
    token,
    activeProfileId,
  });
}

/**
 * Pretty-print a setting value for a read-only cell.
 */
export function renderSettingValue(value: SettingValue): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('value' in obj && Object.keys(obj).length === 1) {
      return renderSettingValue(obj.value as SettingValue);
    }
    return JSON.stringify(obj);
  }
  return String(value);
}
