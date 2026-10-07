'use client';

import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from '@/app/actions/notifications';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { NotificationsResponse } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { NotificationRow } from './NotificationRow';

const PER_PAGE = 20;

/**
 * TCK-588 — l'historique des notifications : paginé côté serveur (`page`, `per_page`), filtré
 * côté serveur (`filter[unread]=1`), jamais sur une liste déjà récupérée. La cloche n'en montre
 * que les dix dernières.
 */
export function NotificationsHistory() {
  const t = useTranslations('notifications.history');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery<NotificationsResponse, Error>({
    queryKey: ['notifications', 'history', page, unreadOnly],
    queryFn: async () => {
      const res = await getNotificationsAction({ page, perPage: PER_PAGE, unread: unreadOnly });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const surErreur = (err: unknown) => setActionError(messageErreur(err));

  const toggle = useMutation({
    mutationFn: async ({ id, read }: { id: number; read: boolean }) => {
      const res = read ? await markNotificationReadAction(id) : await markNotificationUnreadAction(id);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      void rafraichir();
    },
    onError: surErreur,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const res = await markAllNotificationsReadAction();
      if (!res.ok) throw new Error(res.message);
      return true;
    },
    onSuccess: () => {
      setActionError(null);
      void rafraichir();
    },
    onError: surErreur,
  });

  const notifications = query.data?.data ?? [];
  const unread = query.data?.meta.unread ?? 0;
  const lastPage = Math.max(1, query.data?.meta.last_page ?? 1);

  const filtrer = (valeur: boolean) => {
    setUnreadOnly(valeur);
    setPage(1);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t('filterLabel')} className="inline-flex rounded-lg border border-border bg-card p-1">
          {[false, true].map((valeur) => (
            <button
              key={String(valeur)}
              type="button"
              aria-pressed={unreadOnly === valeur}
              onClick={() => filtrer(valeur)}
              className={cn(
                'min-h-11 rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                unreadOnly === valeur ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {valeur ? t('filterUnread', { count: unread }) : t('filterAll')}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          {t('markAllRead')}
        </Button>
      </div>

      {actionError ? <ErrorState message={actionError} /> : null}

      {query.isError ? (
        <ErrorState message={messageErreur(query.error)} onRetry={() => void query.refetch()} retryLabel={t('retry')} />
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-8" aria-hidden="true" />}
          title={unreadOnly ? t('emptyUnread') : t('empty')}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              variant="page"
              notification={notification}
              pending={toggle.isPending}
              onOpen={(opened) => {
                if (!opened.read_at) toggle.mutate({ id: opened.id, read: true });
              }}
              onToggleRead={(toggled) => toggle.mutate({ id: toggled.id, read: !toggled.read_at })}
            />
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label={t('pagination')} className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('previous')}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">{t('pageOf', { page, last: lastPage })}</span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={page >= lastPage || query.isFetching}
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
          >
            {t('next')}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
