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
): Promise<PaginatedResponse<Setting>> {
  const qs = buildQueryString(buildSettingsParams(params));
  return apiRequest<PaginatedResponse<Setting>>(`/api/settings${qs ? `?${qs}` : ''}`, {
    token,
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
): Promise<Setting> {
  const res = await apiRequest<ApiResponse<Setting>>(`/api/settings`, {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function updateSetting(
  token: string,
  settingId: number,
  value: Record<string, unknown>,
): Promise<Setting> {
  const res = await apiRequest<ApiResponse<Setting>>(`/api/settings/${settingId}`, {
    method: 'PATCH',
    body: { value },
    token,
  });
  return res.data;
}

export async function deleteSetting(token: string, settingId: number): Promise<void> {
  await apiRequest<unknown>(`/api/settings/${settingId}`, { method: 'DELETE', token });
}

export interface FetchIntegrationsParams {
  readonly agencyId?: number;
  readonly provider?: string;
}

export async function fetchIntegrations(
  token: string,
  params: FetchIntegrationsParams = {},
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
    { token },
  );
}

export async function createIntegration(
  token: string,
  payload: IntegrationFormPayload,
): Promise<Integration> {
  const res = await apiRequest<ApiResponse<Integration>>(`/api/integrations`, {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function updateIntegration(
  token: string,
  integrationId: number,
  payload: Partial<IntegrationFormPayload>,
): Promise<Integration> {
  const res = await apiRequest<ApiResponse<Integration>>(
    `/api/integrations/${integrationId}`,
    {
      method: 'PATCH',
      body: payload,
      token,
    },
  );
  return res.data;
}

export async function testIntegration(
  token: string,
  integrationId: number,
): Promise<IntegrationTestResult> {
  const res = await apiRequest<ApiResponse<IntegrationTestResult>>(
    `/api/integrations/${integrationId}/test`,
    { method: 'POST', token },
  );
  return res.data;
}

export async function deleteIntegration(
  token: string,
  integrationId: number,
): Promise<void> {
  await apiRequest<unknown>(`/api/integrations/${integrationId}`, {
    method: 'DELETE',
    token,
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
