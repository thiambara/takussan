import { apiRequest } from './api';

export type AppNotification = {
  id: number;
  type: string;
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
  };
};

export async function fetchNotifications(
  token: string,
): Promise<NotificationsResponse> {
  return apiRequest<NotificationsResponse>('/api/notifications?per_page=10', {
    token,
  });
}

export async function markNotificationRead(
  token: string,
  notificationId: number,
): Promise<{ data: AppNotification }> {
  return apiRequest<{ data: AppNotification }>(
    `/api/notifications/${notificationId}/read`,
    { method: 'POST', token },
  );
}

export async function markNotificationUnread(
  token: string,
  notificationId: number,
): Promise<{ data: AppNotification }> {
  return apiRequest<{ data: AppNotification }>(
    `/api/notifications/${notificationId}/unread`,
    { method: 'POST', token },
  );
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await apiRequest('/api/notifications/read-all', { method: 'POST', token });
}
