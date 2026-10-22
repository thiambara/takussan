import { apiRequest } from './api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-588 (ADR-0032) — où mène une notification. `path` est un chemin du front, calculé par l'API
 * (`NotificationTarget`) ; absent, la notification n'est pas un lien.
 */
export type NotificationTarget = {
  kind: string;
  id: number | null;
  path: string;
};

/** Un montant brut, tel que l'API le stocke : formaté par le front, dans la langue de l'écran. */
export type NotificationMoney = { amount: string; currency: string };

export type NotificationParam = string | number | NotificationMoney | null;

export type AppNotification = {
  id: number;
  type: string;
  /**
   * Le code du message (`lease_payment.overdue`), rendu par le front sous
   * `notifications.codes.<code>` avec `params`. Absent (lignes anciennes, classes `Notification`
   * historiques) ou inconnu du front : `title`/`body`, déjà rendus par l'API dans la langue de la
   * requête, s'affichent.
   */
  code?: string | null;
  params?: Record<string, NotificationParam> | null;
  target?: NotificationTarget | null;
  title: string;
  body?: string | null;
  content?: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type NotificationsResponse = {
  data: AppNotification[];
  meta: {
    total: number;
    unread: number;
    current_page: number;
    last_page?: number;
    per_page?: number;
  };
};

export type NotificationsQuery = {
  page?: number;
  /** Plafonné à 50 par l'API. */
  perPage?: number;
  unread?: boolean;
};

/**
 * TCK-1326 (P128.05) — les seules colonnes que la cloche et l'historique lisent (règle des champs
 * clairsemés). Ni `data` — que la ressource enrichit à la lecture, pièces signées comprises — ni
 * `sent_at`.
 */
const CHAMPS_NOTIFICATION = 'id,type,code,params,target,title,body,is_read,read_at,created_at';

export async function fetchNotifications(
  token: string,
  { page = 1, perPage = 10, unread = false }: NotificationsQuery = {},
): Promise<NotificationsResponse> {
  const search = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    'fields[app_notifications]': CHAMPS_NOTIFICATION,
  });
  if (unread) search.set('filter[unread]', '1');

  return apiRequest<NotificationsResponse>(cheminApi`/api/notifications?${search.toString()}`, {
    token,
  });
}

export async function markNotificationRead(
  token: string,
  notificationId: number,
): Promise<{ data: AppNotification }> {
  return apiRequest<{ data: AppNotification }>(
    cheminApi`/api/notifications/${notificationId}/read`,
    { method: 'POST', token },
  );
}

export async function markNotificationUnread(
  token: string,
  notificationId: number,
): Promise<{ data: AppNotification }> {
  return apiRequest<{ data: AppNotification }>(
    cheminApi`/api/notifications/${notificationId}/unread`,
    { method: 'POST', token },
  );
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await apiRequest('/api/notifications/read-all', { method: 'POST', token });
}
