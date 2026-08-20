'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  type AppNotification,
  type NotificationsResponse,
} from '@/lib/notifications';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** Clés de repli de `serverActions.notifications` — l'union tient lieu de contrôle de frappe. */
type CleRepli = 'loadFailed' | 'markReadFailed' | 'markUnreadFailed' | 'markAllReadFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<{ ok: false; message: string }> {
  const t = await getTranslations('serverActions.notifications');
  const repli = t(cleRepli);
  if (err instanceof ApiError) {
    // ⚠️ C'était `err.displayMessage || repli`, et le repli était MORT : `displayMessage` rendait
    // une clé i18n, et une clé est *truthy*. Un module `'use server'` traduit avec
    // `getTranslations`, jamais en lisant un libellé pré-calculé sur l'erreur.
    return { ok: false, message: messageErreurApi(err, await getTranslations(), repli) };
  }

  return { ok: false, message: repli };
}

/** Repli commun : le jeton manque, aucun appel n'a été tenté. */
async function nonAuthentifie(): Promise<{ ok: false; message: string }> {
  const t = await getTranslations('serverActions.notifications');
  return { ok: false, message: t('notAuthenticated') };
}

export async function getNotificationsAction(): Promise<
  ActionResult<NotificationsResponse>
> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    return { ok: true, data: await fetchNotifications(token) };
  } catch (err) {
    return failure(err, 'loadFailed');
  }
}

export async function markNotificationReadAction(
  notificationId: number,
): Promise<ActionResult<AppNotification>> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    const res = await markNotificationRead(token, notificationId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'markReadFailed');
  }
}

export async function markNotificationUnreadAction(
  notificationId: number,
): Promise<ActionResult<AppNotification>> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    const res = await markNotificationUnread(token, notificationId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'markUnreadFailed');
  }
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<true>
> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    await markAllNotificationsRead(token);
    return { ok: true, data: true };
  } catch (err) {
    return failure(err, 'markAllReadFailed');
  }
}
