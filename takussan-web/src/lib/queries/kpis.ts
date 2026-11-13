import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
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

/** TCK-2622 — les colonnes que lit « Ce mois » de l'accueil. */
export const KPI_CONFIG_FIELDS_ACCUEIL = ['metric', 'label', 'format', 'sort_order'] as const;

/**
 * TCK-2622 — les KPI ACTIVÉS de l'agence (TCK-2373), dans leur ordre, pour « Ce mois » de l'accueil.
 * Une panne ou un refus rend une liste vide : l'accueil garde alors ses chiffres par défaut (le bloc
 * accompagne, il ne casse pas la page).
 */
export async function fetchKpisActifs(): Promise<Pick<KpiConfig, 'metric' | 'label' | 'format'>[]> {
  const token = await getToken();
  if (!token) return [];
  const qs = buildQueryString({
    fields: { kpi_configs: KPI_CONFIG_FIELDS_ACCUEIL },
    filter: { is_enabled: 1 },
    sort: ['sort_order', 'id'],
  });
  try {
    const reponse = await apiRequest<{ data: Pick<KpiConfig, 'metric' | 'label' | 'format'>[] }>(cheminApi`/api/kpi-configs${requete(qs)}`, { token });
    return Array.isArray(reponse?.data) ? reponse.data : [];
  } catch {
    return [];
  }
}

export async function fetchKpiMetricsCatalog(): Promise<{ data: string[] } | null> {
  const token = await getToken();
  if (!token) return null;
  return apiRequest('/api/kpi-configs/metrics', { token });
}

// TCK-292 (2026-08-22) — `createKpiConfig` et `deleteKpiConfig` ont été SUPPRIMÉES, pas
// excusées : même diagnostic que `./alerts.ts`. Aucun appelant, et les écritures réelles sont
// dans `src/app/actions/kpis.ts`.
