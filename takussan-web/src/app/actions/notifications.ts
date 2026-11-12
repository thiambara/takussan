'use server';

import { ApiError, messageErreurApi } from '@/lib/api';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  type AppNotification,
  type NotificationsQuery,
  type NotificationsResponse,
} from '@/lib/notifications';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** Clés de repli de `serverActions.notifications` — l'union tient lieu de contrôle de frappe. */
type CleRepli = 'loadFailed' | 'markReadFailed' | 'markUnreadFailed' | 'markAllReadFailed';

async function failure(err: unknown, cleRepli: CleRepli): Promise<{ ok: false; message: string }> {
  journaliserErreurInattendue('notifications', err);
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

export async function getNotificationsAction(
  query: NotificationsQuery = {},
): Promise<ActionResult<NotificationsResponse>> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  try {
    return { ok: true, data: await fetchNotifications(token, query) };
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

/**
 * TCK-2634 — « Tout lire » d'un repli : chacune de ses lignes non lues. L'API n'a pas de route en lot
 * (`read`, `unread`, `read-all` seulement) : l'éventail part d'ici, par paquets de 5, BORNÉ à la liste
 * affichée (20 lignes au plus, la cloche comme une page d'historique) — un appel plus large n'en lit
 * que les 20 premières. Un échec partiel n'efface pas les réussites : il est COMPTÉ (`echecs`), et
 * l'écran le dit ; tout échoue → l'erreur, comme les autres gestes.
 */
export async function markNotificationsReadAction(
  notificationIds: readonly number[],
): Promise<ActionResult<{ lues: AppNotification[]; echecs: number }>> {
  const token = await getToken();
  if (!token) return nonAuthentifie();

  const ids = notificationIds.slice(0, 20);
  const lues: AppNotification[] = [];
  const raisons: unknown[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    const reponses = await Promise.allSettled(ids.slice(i, i + 5).map((id) => markNotificationRead(token, id)));
    for (const r of reponses) {
      if (r.status === 'fulfilled') lues.push(r.value.data);
      else raisons.push(r.reason);
    }
  }
  if (lues.length === 0 && raisons.length > 0) return failure(raisons[0], 'markReadFailed');
  // Un échec partiel n'a pas de `catch` : sans cette ligne, un bug de l'éventail se tairait côté
  // serveur (TCK-775), l'écran ne disant que « N n'ont pas pu être marquées lues ».
  for (const raison of raisons) journaliserErreurInattendue('notifications', raison);
  return { ok: true, data: { lues, echecs: raisons.length } };
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
