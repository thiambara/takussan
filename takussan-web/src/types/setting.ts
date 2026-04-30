/**
 * Setting / Integration types — TCK-023 / TCK-068.
 *
 * Source of truth: `takussan-api/app/Http/Resources/SettingResource.php`
 * and `IntegrationResource.php`. Secrets (`credentials`) are never exposed
 * by the API after creation — the backend returns them as `$hidden`.
 */

export type SettingScope = 'global' | 'agency';

export type SettingValue =
  | string
  | number
  | boolean
  | null
  | SettingValue[]
  | { [key: string]: SettingValue };

export interface Setting {
  id: number;
  key: string;
  value: SettingValue;
  scope: SettingScope;
  scope_id: number | null;
  updated_by_id: number | null;
  updated_at: string | null;
}

export interface Integration {
  id: number;
  provider: string;
  agency_id: number | null;
  is_active: boolean;
  last_used_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface IntegrationTestResult {
  ok: boolean;
  message: string;
  last_used_at?: string | null;
}
