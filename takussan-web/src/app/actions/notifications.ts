'use server';

import { ApiError } from '@/lib/api';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  type AppNotification,
  type NotificationsResponse,
} from '@/lib/notifications';
import { getToken } from '@/lib/session';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function failure(err: unknown, fallback: string): { ok: false; message: string } {
  if (err instanceof ApiError) {
    return { ok: false, message: err.displayMessage || fallback };
  }

  return { ok: false, message: fallback };
}

export async function getNotificationsAction(): Promise<
  ActionResult<NotificationsResponse>
> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Non authentifié.' };

  try {
    return { ok: true, data: await fetchNotifications(token) };
  } catch (err) {
    return failure(err, 'Impossible de charger les notifications.');
  }
}

export async function markNotificationReadAction(
  notificationId: number,
): Promise<ActionResult<AppNotification>> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Non authentifié.' };

  try {
    const res = await markNotificationRead(token, notificationId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'Impossible de marquer la notification comme lue.');
  }
}

export async function markNotificationUnreadAction(
  notificationId: number,
): Promise<ActionResult<AppNotification>> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Non authentifié.' };

  try {
    const res = await markNotificationUnread(token, notificationId);
    return { ok: true, data: res.data };
  } catch (err) {
    return failure(err, 'Impossible de marquer la notification comme non lue.');
  }
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<true>
> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Non authentifié.' };

  try {
    await markAllNotificationsRead(token);
    return { ok: true, data: true };
  } catch (err) {
    return failure(err, 'Impossible de marquer toutes les notifications comme lues.');
  }
}
