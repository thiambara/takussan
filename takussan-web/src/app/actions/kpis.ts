'use server';

import { apiRequest, refusDAction, type RefusDAction } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import type { KpiConfig, KpiConfigInput } from '@/lib/queries/kpis';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/**
 * Server actions for KPI configuration (TCK-032 P3).
 */
export async function createKpiConfigAction(
  input: KpiConfigInput,
): Promise<{ ok: true; data: KpiConfig } | ({ ok: false } & RefusDAction)> {
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
    revalidatePath('/app/reports/indicators');
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('kpis', err);
    // TCK-3008 — c'était `(err as Error).message` : « API error 422 » à l'écran, sans code ni langue.
    const repli = (await getTranslations('serverActions.shared'))('networkErrorRetry');
    return { ok: false, ...refusDAction(err, await getTranslations(), repli) };
  }
}

/**
 * TCK-2629 — l'ordre et le masquage d'un indicateur (`sort_order`, `is_enabled`), écrits à « Terminé » du
 * réglage de la vue d'ensemble : `PATCH kpi-configs/{id}`, que l'API accepte depuis TCK-032.
 */
export async function updateKpiConfigAction(
  id: number,
  input: Partial<Pick<KpiConfigInput, 'sort_order' | 'is_enabled' | 'label' | 'format'>>,
): Promise<{ ok: true; data: KpiConfig } | ({ ok: false } & RefusDAction)> {
  const token = await getToken();
  if (!token) {
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  try {
    const res = await apiRequest<{ data: KpiConfig }>(cheminApi`/api/kpi-configs/${id}`, {
      token,
      method: 'PATCH',
      body: input,
    });
    revalidatePath('/app/reports');
    revalidatePath('/app/reports/indicators');
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('kpis', err);
    // TCK-3008 — c'était `(err as Error).message` : « API error 422 » à l'écran, sans code ni langue.
    const repli = (await getTranslations('serverActions.shared'))('networkErrorRetry');
    return { ok: false, ...refusDAction(err, await getTranslations(), repli) };
  }
}

export async function deleteKpiConfigAction(id: number): Promise<{ ok: boolean }> {
  const token = await getToken();
  if (!token) return { ok: false };

  try {
    await apiRequest(cheminApi`/api/kpi-configs/${id}`, { token, method: 'DELETE' });
    revalidatePath('/app/reports/indicators');
    return { ok: true };
  } catch (err) {
    journaliserErreurInattendue('kpis', err);
    return { ok: false };
  }
}
