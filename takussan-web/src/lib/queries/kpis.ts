import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Server wrappers around /api/kpi-configs (TCK-032 P3).
 */

export type KpiConfig = {
  id: number;
  agency_id: number;
  metric: string;
  label: string;
  format: 'number' | 'percent' | 'currency';
  sort_order: number;
  is_enabled: boolean;
  settings: Record<string, unknown> | null;
};

export type KpiConfigInput = {
  metric: string;
  label: string;
  format?: KpiConfig['format'];
  sort_order?: number;
  is_enabled?: boolean;
  settings?: Record<string, unknown>;
};

export async function fetchKpiConfigs(): Promise<{ data: KpiConfig[] } | null> {
  const token = await getToken();
  if (!token) return null;
  return apiRequest('/api/kpi-configs', { token });
}

export async function fetchKpiMetricsCatalog(): Promise<{ data: string[] } | null> {
  const token = await getToken();
  if (!token) return null;
  return apiRequest('/api/kpi-configs/metrics', { token });
}

// TCK-292 (2026-08-22) — `createKpiConfig` et `deleteKpiConfig` ont été SUPPRIMÉES, pas
// excusées : même diagnostic que `./alerts.ts`. Aucun appelant, et les écritures réelles sont
// dans `src/app/actions/kpis.ts`.
