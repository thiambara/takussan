'use server';

import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import type { KpiConfig, KpiConfigInput } from '@/lib/queries/kpis';

/**
 * Server actions for KPI configuration (TCK-032 P3).
 */
export async function createKpiConfigAction(
  input: KpiConfigInput,
): Promise<{ ok: true; data: KpiConfig } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) {
    // Le littéral d'origine était l'anglais « Not authenticated. », affiché tel quel à un
    // utilisateur francophone (TCK-292, lot K).
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  try {
    const res = await apiRequest<{ data: KpiConfig }>('/api/kpi-configs', {
      token,
      method: 'POST',
      body: input,
    });
    revalidatePath('/app/overview/kpis');
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function deleteKpiConfigAction(id: number): Promise<{ ok: boolean }> {
  const token = await getToken();
  if (!token) return { ok: false };

  try {
    await apiRequest('/api/kpi-configs/' + id, { token, method: 'DELETE' });
    revalidatePath('/app/overview/kpis');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
