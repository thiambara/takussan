'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslations } from 'next-intl';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { NotificationRow } from '@/components/notifications/NotificationRow';

const QUERY_KEY = ['notifications', 'feed'] as const;

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
  const messageErreur = useMessageErreurApi();
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
    onError: (err) => setLocalError(messageErreur(err)),
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
    onError: (err) => setLocalError(messageErreur(err)),
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
    onError: (err) => setLocalError(messageErreur(err)),
  });

  /*
   * TCK-569 (M14, retour testeur du 2026-09-23) — le panneau est la fenêtre de la primitive
   * `Popover` (base-ui), du même système de fermeture que le menu utilisateur voisin (`Menu`,
   * base-ui), au lieu d'un écouteur `pointerdown` écrit à la main.
   *
   * La capture du testeur (panneau décalé hors de l'écran, menu utilisateur ouvert par-dessus, appui
   * « dans le vide » sans effet) est celle d'un build de préproduction ANTÉRIEUR au 2026-09-16 : le
   * panneau n'avait alors AUCUNE fermeture extérieure et s'ancrait à droite de la cloche. Au doigt,
   * l'écouteur posé par la revue design du 2026-09-16 suffisait (mesuré, Chrome, émulation tactile,
   * 320 px). Ce qu'il laissait passer, mesuré à 320 ET à 1366 px : il n'écoutait que le pointeur.
   * Cloche ouverte, Tab jusqu'à l'avatar, Entrée → panneau et menu ouverts l'un sur l'autre. La
   * primitive referme le panneau dès que le focus le quitte, sur appui extérieur et sur Échap, et
   * rend le focus à la cloche.
   *
   * Géométrie inchangée sous `sm` (8 px de chaque bord, ce que faisait `inset-x-2`) : le
   * positionneur aligne le panneau sur la cloche puis le recale dans l'écran à `collisionPadding`.
   * En bureau, 864..1248 à 1366 px comme avant ; il s'ouvre 4 px sous la barre au lieu d'en
   * chevaucher le bas de 2 px.
   *
   * Pastille : `red-500` sous du blanc rendait 3,76:1 — sous les 4,5:1 d'un texte de 10 px.
   * `--destructive` rend 7,3:1 et suit la charte.
   */
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t('label')}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-white/85 after:absolute after:-inset-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 tabular-nums text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={14}
        collisionPadding={8}
        // TCK-572 (solde de TCK-569) — un appui à côté ferme le panneau et rien d'autre, comme le
        // menu utilisateur voisin : cloche ouverte, l'appui sur l'avatar n'ouvre plus le menu.
        voile
        aria-label={t('center')}
        className="w-96 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl bg-card p-0 text-card-foreground shadow-lg ring-border"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t('label')}</h2>
            <p className="text-xs text-muted-foreground">{t('unread', { count: unread })}</p>
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
          <p role="alert" className="px-4 py-2 text-sm text-destructive">
            {localError}
          </p>
        ) : null}

        {query.isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t('loading')}</p>
        ) : null}

        {query.isError ? (
          <p role="alert" className="px-4 py-6 text-sm text-destructive">
            {messageErreur(query.error)}
          </p>
        ) : null}

        {!query.isLoading && !query.isError && notifications.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
        ) : null}

        {notifications.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                pending={markRead.isPending || markUnread.isPending}
                onOpen={(opened) => {
                  // TCK-588 — ouvrir une notification la marque lue, et ferme la cloche.
                  if (!opened.read_at) markRead.mutate(opened.id);
                  setOpen(false);
                }}
                onToggleRead={(toggled) =>
                  toggled.read_at ? markUnread.mutate(toggled.id) : markRead.mutate(toggled.id)
                }
              />
            ))}
          </ul>
        ) : null}

        <footer className="border-t border-border">
          <Link
            href="/app/notifications"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center px-4 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {t('viewAll')}
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
