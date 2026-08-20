'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferenceUpdate,
  type NotificationPreferencesResponse,
} from '@/lib/notification-preferences';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-070 — Server actions for the notification preferences matrix.
 */

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** Clés de repli de `serverActions.notificationPreferences`. */
type CleRepli = 'loadFailed' | 'updateFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<{ ok: false; message: string }> {
  const t = await getTranslations('serverActions.notificationPreferences');
  const repli = t(cleRepli);
  if (err instanceof ApiError) {
    // ⚠️ C'était `err.displayMessage || repli`, et le repli était MORT : `displayMessage` rendait
    // une clé i18n, et une clé est *truthy*. Un module `'use server'` traduit avec
    // `getTranslations`, jamais en lisant un libellé pré-calculé sur l'erreur.
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }
  return { ok: false, message: repli };
}

/**
 * Le jeton manque. Le littéral d'origine était l'anglais « Not authenticated. », affiché tel quel
 * à un utilisateur francophone (TCK-292, lot K) ; `errors.missingToken` est la formulation déjà
 * retenue pour ce cas ailleurs dans le parc.
 */
async function nonAuthentifie(): Promise<{ ok: false; message: string }> {
  const tErr = await getTranslations('errors');
  return { ok: false, message: tErr('missingToken') };
}

export async function getNotificationPreferencesAction(): Promise<
  ActionResult<NotificationPreferencesResponse>
> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    const data = await getNotificationPreferences(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'loadFailed');
  }
}

export async function updateNotificationPreferencesAction(
  preferences: NotificationPreferenceUpdate[],
): Promise<ActionResult<NotificationPreferencesResponse>> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    const data = await updateNotificationPreferences(token, preferences);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'updateFailed');
  }
}
