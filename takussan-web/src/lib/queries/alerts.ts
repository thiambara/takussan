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

export async function createThresholdAlert(payload: ThresholdAlertInput) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiRequest<{ data: ThresholdAlert }>('/api/threshold-alerts', {
    token,
    method: 'POST',
    body: payload,
  });
}

export async function deleteThresholdAlert(id: number) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiRequest('/api/threshold-alerts/' + id, { token, method: 'DELETE' });
}
