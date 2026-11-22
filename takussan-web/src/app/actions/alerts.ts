'use server';

import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import type { ThresholdAlert, ThresholdAlertInput } from '@/lib/queries/alerts';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/**
 * Server actions for threshold alerts (TCK-032 P3).
 */
export async function createThresholdAlertAction(
  input: ThresholdAlertInput,
): Promise<{ ok: true; data: ThresholdAlert } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) {
    // Le littéral d'origine était l'anglais « Not authenticated. », affiché tel quel à un
    // utilisateur francophone (TCK-292, lot K).
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  try {
    // TCK-2868 — `include=triggers` : la réponse remplace la ligne de l'onglet, « Déclenchements récents » compris.
    const res = await apiRequest<{ data: ThresholdAlert }>('/api/threshold-alerts?include=triggers', {
      token,
      method: 'POST',
      body: input,
    });
    revalidatePath('/app/reports/alerts');
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('alerts', err);
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * TCK-2629 — modifier une alerte (métrique, opérateur, seuil, sévérité, délai) : `PATCH`, que l'API
 * accepte depuis TCK-032 (`UpdateThresholdAlertRequest`). La réponse est relue par l'onglet, valeur
 * actuelle comprise.
 */
export async function updateThresholdAlertAction(
  id: number,
  input: Partial<ThresholdAlertInput>,
): Promise<{ ok: true; data: ThresholdAlert } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) {
    const tErr = await getTranslations('errors');
    return { ok: false, message: tErr('missingToken') };
  }

  try {
    // TCK-2868 — `include=triggers`, comme la création : modifier une alerte ne vide pas ses déclenchements.
    const res = await apiRequest<{ data: ThresholdAlert }>(cheminApi`/api/threshold-alerts/${id}?include=triggers`, {
      token,
      method: 'PATCH',
      body: input,
    });
    revalidatePath('/app/reports/alerts');
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('alerts', err);
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * TCK-2868 — « Qui est prévenu » : les destinataires possibles d'une alerte sur `metric`, avant qu'elle
 * existe (`GET /api/threshold-alerts/recipient-candidates`, TCK-2866 — la garde de la création).
 */
export async function recipientCandidatesAction(
  metric: string,
): Promise<{ ok: true; data: { id: number; name: string | null }[] } | { ok: false }> {
  const token = await getToken();
  if (!token) return { ok: false };

  try {
    const res = await apiRequest<{ data: { id: number; name: string | null }[] }>(
      cheminApi`/api/threshold-alerts/recipient-candidates${requete(buildQueryString({ extra: { metric } }))}`,
      { token },
    );
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('alerts', err);
    return { ok: false };
  }
}

export async function deleteThresholdAlertAction(id: number): Promise<{ ok: boolean }> {
  const token = await getToken();
  if (!token) return { ok: false };

  try {
    await apiRequest(cheminApi`/api/threshold-alerts/${id}`, { token, method: 'DELETE' });
    revalidatePath('/app/reports/alerts');
    return { ok: true };
  } catch (err) {
    journaliserErreurInattendue('alerts', err);
    return { ok: false };
  }
}
