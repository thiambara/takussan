/**
 * TCK-070 — Notification preferences matrix client.
 *
 * Mirrors `App\Http\Controllers\Api\NotificationPreferenceController` and
 * `App\Services\Notifications\PreferenceResolver` on the backend.
 */

import { apiRequest } from './api';

export type NotificationChannel = 'inapp' | 'email' | 'push' | 'sms' | 'whatsapp';

export type NotificationPreferenceCell = {
  event_type: string;
  channel: NotificationChannel;
  enabled: boolean;
  locked: boolean;
  /** Present when `locked` is true — e.g. `inapp_always_on`, `phone_not_verified`, `phone_without_whatsapp`. */
  reason?: string;
};

/**
 * TCK-2636 — LES GROUPES DE L'ÉCRAN, et la liste des événements qu'on en DÉRIVE.
 *
 * L'ordre des groupes est celui de la maquette retenue (`app-profil` a-2) : les baux en tête, et
 * « Loyer en retard » en premier — l'événement qu'on vient régler sur WhatsApp. Le regroupement vit
 * côté front seul (l'API ne porte aucun texte d'interface) ; les LIBELLÉS sont dans
 * `src/messages/{fr,en,wo}.json`, sous `profile.notifications.events.*`.
 *
 * ⚠ `EVENEMENTS_DE_PREFERENCE` est DÉRIVÉE des groupes, jamais écrite à côté : une liste à part
 * pouvait être juste pendant qu'un événement n'était rendu dans aucun groupe. Elle était écrite à
 * la main avec le commentaire « Must mirror `PreferenceResolver::EVENTS` » et en avait perdu six
 * sur vingt — que personne ne pouvait couper. `notification-preferences.parity.test.ts` lit la
 * constante PHP et rougit au premier écart, dans un sens comme dans l'autre.
 */
export const GROUPES_DE_PREFERENCES = [
  {
    cle: 'leases',
    evenements: [
      'lease_payment_overdue',
      'lease_payment_due',
      // TCK-588 — le reçu de paiement a son propre interrupteur (il obéissait à « échéance »).
      'lease_payment_received',
      // TCK-2636 — les cinq événements des baux que l'API envoyait sans interrupteur.
      'lease_renewed',
      'lease_early_termination',
      'lease_rent_reviewed',
      'invoice_reminder_sent',
      'tenant_inventory_reminder',
    ],
  },
  { cle: 'messages', evenements: ['message_received'] },
  { cle: 'bookings', evenements: ['booking_request', 'booking_status_changed'] },
  { cle: 'maintenance', evenements: ['maintenance_status_changed'] },
  { cle: 'reviews', evenements: ['review_received'] },
  {
    cle: 'alerts',
    evenements: [
      'saved_search_match',
      // TCK-599 §5 — les favoris qui préviennent : la baisse et l'indisponibilité.
      'favorite_price_drop',
      'favorite_unavailable',
      'visit_reminder',
      'threshold_alert',
      // TCK-2636 — le rappel de tâche (`tasks:send-due-reminders`), sans interrupteur jusque-là.
      'task_due_reminder',
    ],
  },
  // TCK-2432 — la source d'un bien publié par le Radar a disparu : son titulaire est questionné.
  { cle: 'properties', evenements: ['property_availability_check'] },
] as const satisfies readonly { readonly cle: string; readonly evenements: readonly string[] }[];

export type EvenementDePreference = (typeof GROUPES_DE_PREFERENCES)[number]['evenements'][number];

export const EVENEMENTS_DE_PREFERENCE: readonly EvenementDePreference[] = GROUPES_DE_PREFERENCES.flatMap(
  (g) => g.evenements,
);

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
