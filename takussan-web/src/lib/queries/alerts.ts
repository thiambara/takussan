import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Server wrappers around /api/threshold-alerts (TCK-032 P3).
 */

export type ThresholdAlert = {
  id: number;
  agency_id: number;
  metric: string;
  operator: '>' | '<' | '>=' | '<=';
  threshold: number | string;
  severity: 'info' | 'warning' | 'critical';
  is_enabled: boolean;
  cooldown_hours: number;
  last_triggered_at: string | null;
  last_value: number | string | null;
};

export type ThresholdAlertInput = {
  metric: string;
  operator: ThresholdAlert['operator'];
  threshold: number;
  severity?: ThresholdAlert['severity'];
  is_enabled?: boolean;
  cooldown_hours?: number;
};

export async function fetchThresholdAlerts(): Promise<{ data: ThresholdAlert[] } | null> {
  const token = await getToken();
  if (!token) return null;
  return apiRequest('/api/threshold-alerts', { token });
}

// TCK-292 (2026-08-22) — `createThresholdAlert` et `deleteThresholdAlert` ont été SUPPRIMÉES,
// pas excusées. Elles portaient `throw new Error('Not authenticated')` et n'avaient AUCUN
// appelant (`grep -rnE '\bcreateThresholdAlert\b' src/` → la définition seule) : les vraies
// écritures vivent dans `src/app/actions/alerts.ts`, qui refait l'appel lui-même et traduit son
// message par `getTranslations('errors')`. Ne subsistent ici que la lecture, réellement appelée
// par `app/(dashboard)/app/overview/alerts/page.tsx`, et les types que l'action importe.
