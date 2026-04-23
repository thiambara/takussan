'use server';

import { ApiError } from '@/lib/api';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferenceUpdate,
  type NotificationPreferencesResponse,
} from '@/lib/notification-preferences';
import { getToken } from '@/lib/session';

/**
 * TCK-070 — Server actions for the notification preferences matrix.
 */

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function failure(err: unknown, fallback: string): { ok: false; message: string } {
  if (err instanceof ApiError) {
    return { ok: false, message: err.displayMessage || fallback };
  }
  return { ok: false, message: fallback };
}

export async function getNotificationPreferencesAction(): Promise<
  ActionResult<NotificationPreferencesResponse>
> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

  try {
    const data = await getNotificationPreferences(token);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Impossible de charger les préférences.');
  }
}

export async function updateNotificationPreferencesAction(
  preferences: NotificationPreferenceUpdate[],
): Promise<ActionResult<NotificationPreferencesResponse>> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Not authenticated.' };

  try {
    const data = await updateNotificationPreferences(token, preferences);
    return { ok: true, data };
  } catch (err) {
    return failure(err, 'Impossible de mettre à jour les préférences.');
  }
}
