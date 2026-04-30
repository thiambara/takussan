/**
 * TCK-070 — Notification preferences matrix client.
 *
 * Mirrors `App\Http\Controllers\Api\NotificationPreferenceController` and
 * `App\Services\Notifications\PreferenceResolver` on the backend.
 */

import { apiRequest } from './api';

export type NotificationChannel = 'inapp' | 'email' | 'push' | 'sms';

export type NotificationPreferenceCell = {
  event_type: string;
  channel: NotificationChannel;
  enabled: boolean;
  locked: boolean;
  /** Present when `locked` is true — e.g. `inapp_always_on`, `phone_not_verified`. */
  reason?: string;
};

export type NotificationPreferencesResponse = {
  preferences: NotificationPreferenceCell[];
  events: string[];
  channels: NotificationChannel[];
  phone_verified: boolean;
};

export async function getNotificationPreferences(
  token: string,
): Promise<NotificationPreferencesResponse> {
  const res = await apiRequest<{ data: NotificationPreferencesResponse }>(
    '/api/me/notification-preferences',
    { token },
  );
  return res.data;
}

export type NotificationPreferenceUpdate = {
  event_type: string;
  channel: NotificationChannel;
  enabled: boolean;
};

export async function updateNotificationPreferences(
  token: string,
  preferences: NotificationPreferenceUpdate[],
): Promise<NotificationPreferencesResponse> {
  const res = await apiRequest<{ data: NotificationPreferencesResponse }>(
    '/api/me/notification-preferences',
    { method: 'PATCH', token, body: { preferences } },
  );
  return res.data;
}
