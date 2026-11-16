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
      // TCK-2783 — le rappel d'expiration d'une pièce du coffre (`documents:remind-expiring`).
      'document_expiring',
    ],
  },
  // TCK-2432 — la source d'un bien publié par le Radar a disparu : son titulaire est questionné.
  { cle: 'properties', evenements: ['property_availability_check'] },
] as const satisfies readonly { readonly cle: string; readonly evenements: readonly string[] }[];

export type EvenementDePreference = (typeof GROUPES_DE_PREFERENCES)[number]['evenements'][number];

export const EVENEMENTS_DE_PREFERENCE: readonly EvenementDePreference[] = GROUPES_DE_PREFERENCES.flatMap(
  (g) => g.evenements,
);

/**
 * TCK-2863 / TCK-2864 — une ligne du catalogue (`App\Domain\Notifications\PreferenceCatalog`) : un
 * événement, les personas de `/app` qui le reçoivent, et, pour un événement IMPOSÉ (`locked`), ses
 * canaux fixes et sa raison (`always_sent`). L'API le rend NON filtré au `PATCH` : l'écran filtre
 * lui-même, sur la persona de la coque.
 */
export type LigneDuCatalogue = {
  event_type: string;
  locked: boolean;
  channels: NotificationChannel[] | null;
  personas: string[];
  reason?: string;
};

export type NotificationPreferencesResponse = {
  preferences: NotificationPreferenceCell[];
  events: string[];
  channels: NotificationChannel[];
  phone_verified: boolean;
  /** TCK-2863 — absent d'une API plus ancienne : rien n'est alors masqué ni ajouté. */
  catalog?: LigneDuCatalogue[];
};

/**
 * TCK-2864 — le groupe où se range chaque événement IMPOSÉ (maquette `app-profil-pieces`, l. 231 :
 * « Vérification d'identité » en tête des alertes). Un imposé inconnu ici n'est pas rendu.
 */
export const GROUPE_DES_IMPOSES: Readonly<Record<string, (typeof GROUPES_DE_PREFERENCES)[number]['cle']>> = {
  identity_verification: 'alerts',
};

/**
 * TCK-2864 — ce que l'écran montre à une persona : les événements réglables qu'elle reçoit (`null` :
 * tous — pas de catalogue, ou pas de persona à juger) et les événements imposés qu'elle reçoit.
 */
export function vueDuCatalogue(
  catalog: readonly LigneDuCatalogue[] | undefined,
  persona: string | null | undefined,
): { readonly reglables: ReadonlySet<string> | null; readonly imposes: readonly LigneDuCatalogue[] } {
  if (!catalog) return { reglables: null, imposes: [] };
  const recoit = (l: LigneDuCatalogue) => !persona || l.personas.includes(persona);
  const imposes = catalog.filter((l) => l.locked && recoit(l) && l.event_type in GROUPE_DES_IMPOSES);
  return {
    reglables: persona ? new Set(catalog.filter((l) => !l.locked && recoit(l)).map((l) => l.event_type)) : null,
    imposes,
  };
}

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
