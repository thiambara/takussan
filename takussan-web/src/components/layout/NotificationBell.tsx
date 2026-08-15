'use client';

import { useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from '@/app/actions/notifications';
import type {
  AppNotification,
  NotificationsResponse,
} from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const QUERY_KEY = ['notifications', 'feed'] as const;

function notificationBody(notification: AppNotification): string | null {
  return notification.body ?? notification.content ?? null;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-SN`, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function patchNotification(
  previous: NotificationsResponse | undefined,
  notification: AppNotification,
): NotificationsResponse | undefined {
  if (!previous) return previous;

  const wasUnread = previous.data.some(
    (item) => item.id === notification.id && !item.read_at,
  );
  const isUnread = !notification.read_at;

  return {
    ...previous,
    data: previous.data.map((item) =>
      item.id === notification.id ? notification : item,
    ),
    meta: {
      ...previous.meta,
      unread: Math.max(
        0,
        previous.meta.unread + (isUnread ? 1 : 0) - (wasUnread ? 1 : 0),
      ),
    },
  };
}

export function NotificationBell() {
  const t = useTranslations('nav.notifications');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery<NotificationsResponse, Error>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await getNotificationsAction();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const notifications = useMemo(
    () =>
      [...(query.data?.data ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [query.data?.data],
  );

  const unread = query.data?.meta.unread ?? 0;

  const markRead = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await markNotificationReadAction(notificationId);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: (notification) => {
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY, (previous) =>
        patchNotification(previous, notification),
      );
      setLocalError(null);
    },
    onError: (err) => setLocalError(err.message),
  });

  const markUnread = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await markNotificationUnreadAction(notificationId);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: (notification) => {
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY, (previous) =>
        patchNotification(previous, notification),
      );
      setLocalError(null);
    },
    onError: (err) => setLocalError(err.message),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const res = await markAllNotificationsReadAction();
      if (!res.ok) throw new Error(res.message);
      return true;
    },
    onSuccess: () => {
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY, (previous) =>
        previous
          ? {
              ...previous,
              data: previous.data.map((item) => ({
                ...item,
                is_read: true,
                read_at: item.read_at ?? new Date().toISOString(),
              })),
              meta: { ...previous.meta, unread: 0 },
            }
          : previous,
      );
      setLocalError(null);
    },
    onError: (err) => setLocalError(err.message),
  });

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('label')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label={t('center')}
          className="absolute right-0 top-11 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-app-surface-3 bg-white text-app-ink shadow-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-app-surface-3 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{t('label')}</h2>
              <p className="text-xs text-app-ink-muted">{t('unread', { count: unread })}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              {t('markAllRead')}
            </Button>
          </header>

          {localError ? (
            <p role="alert" className="px-4 py-2 text-sm text-red-600">
              {localError}
            </p>
          ) : null}

          {query.isLoading ? (
            <p className="px-4 py-6 text-sm text-app-ink-muted">{t('loading')}</p>
          ) : null}

          {query.isError ? (
            <p role="alert" className="px-4 py-6 text-sm text-red-600">
              {query.error.message}
            </p>
          ) : null}

          {!query.isLoading && !query.isError && notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-app-ink-muted">{t('empty')}</p>
          ) : null}

          {notifications.length > 0 ? (
            <ul className="max-h-96 overflow-y-auto divide-y divide-app-surface-3">
              {notifications.map((notification) => {
                const unreadItem = !notification.read_at;
                return (
                  <li
                    key={notification.id}
                    className={cn(
                      'px-4 py-3',
                      unreadItem ? 'bg-amber-50/70' : 'bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {notification.title}
                        </p>
                        {notificationBody(notification) ? (
                          <p className="mt-1 line-clamp-2 text-xs text-app-ink-muted">
                            {notificationBody(notification)}
                          </p>
                        ) : null}
                        <p className="mt-2 text-[11px] text-app-ink-muted">
                          {formatDate(notification.created_at, locale)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-app-primary hover:underline disabled:opacity-50"
                        disabled={markRead.isPending || markUnread.isPending}
                        onClick={() =>
                          unreadItem
                            ? markRead.mutate(notification.id)
                            : markUnread.mutate(notification.id)
                        }
                      >
                        {unreadItem ? t('markRead') : t('markUnread')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
