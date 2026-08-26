'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  getNotificationPreferencesAction,
  updateNotificationPreferencesAction,
} from '@/app/actions/notification-preferences';
import type {
  NotificationChannel,
  NotificationPreferenceCell,
  NotificationPreferencesResponse,
} from '@/lib/notification-preferences';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-070 — event_type × channel matrix. Renders the backend-provided
 * grid and lets the user toggle individual cells. Save-on-click — each
 * toggle triggers a PATCH, the button flashes "Enregistré" on success.
 *
 * The `locked` flag on a cell (e.g. inapp always-on, sms without a
 * verified phone) disables it and shows the reason inline.
 */

// Grouping lives on the frontend only (keeps the backend free of UI copy).
// Must mirror `PreferenceResolver::EVENTS`. Les LIBELLÉS, eux, vivent dans
// `src/messages/{fr,en,wo}.json` sous `profile.notifications.*` (TCK-292) : la
// donnée ci-dessous ne porte plus que des CLÉS.
const EVENTS: readonly string[] = [
  'message_received',
  'booking_request',
  'booking_status_changed',
  'lease_payment_due',
  'lease_payment_overdue',
  'maintenance_status_changed',
  'review_received',
  'saved_search_match',
  'visit_reminder',
  'threshold_alert',
];

const GROUPS: { key: string; events: string[] }[] = [
  { key: 'messages', events: ['message_received'] },
  {
    key: 'bookings',
    events: ['booking_request', 'booking_status_changed'],
  },
  { key: 'leases', events: ['lease_payment_due', 'lease_payment_overdue'] },
  { key: 'maintenance', events: ['maintenance_status_changed'] },
  { key: 'reviews', events: ['review_received'] },
  { key: 'alerts', events: ['saved_search_match', 'visit_reminder', 'threshold_alert'] },
];

const PREFS_KEY = ['notifications', 'preferences'] as const;

function cellKey(event: string, channel: string): string {
  return `${event}|${channel}`;
}

function normalizePreferencesResponse(
  next: Partial<NotificationPreferencesResponse>,
  previous?: NotificationPreferencesResponse,
): NotificationPreferencesResponse {
  return {
    preferences: Array.isArray(next.preferences)
      ? next.preferences
      : (previous?.preferences ?? []),
    events: Array.isArray(next.events) ? next.events : (previous?.events ?? []),
    channels: Array.isArray(next.channels)
      ? next.channels
      : (previous?.channels ?? ['inapp', 'email', 'push', 'sms']),
    phone_verified:
      typeof next.phone_verified === 'boolean'
        ? next.phone_verified
        : (previous?.phone_verified ?? false),
  };
}

export function NotificationPreferencesMatrix() {
  const t = useTranslations('profile.notifications');
  const tCommon = useTranslations('common.status');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  // Repli sur le jeton brut pour un événement que le back émettrait sans que le
  // front ne le connaisse — même invariant que le `?? event` d'avant.
  const labelEvenement = (event: string) => (EVENTS.includes(event) ? t(`events.${event}`) : event);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const query = useQuery<NotificationPreferencesResponse, Error>({
    queryKey: PREFS_KEY,
    queryFn: async () => {
      const res = await getNotificationPreferencesAction();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (entry: {
      event_type: string;
      channel: NotificationChannel;
      enabled: boolean;
    }) => {
      const res = await updateNotificationPreferencesAction([entry]);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY });
      const previous =
        queryClient.getQueryData<NotificationPreferencesResponse>(PREFS_KEY);
      if (previous) {
        queryClient.setQueryData<NotificationPreferencesResponse>(PREFS_KEY, {
          ...previous,
          preferences: previous.preferences.map((c) =>
            c.event_type === entry.event_type &&
            c.channel === entry.channel &&
            !c.locked
              ? { ...c, enabled: entry.enabled }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (err, _entry, context) => {
      setLocalError(messageErreur(err));
      if (context?.previous) {
        queryClient.setQueryData(PREFS_KEY, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<NotificationPreferencesResponse>(
        PREFS_KEY,
        (previous) => normalizePreferencesResponse(data, previous),
      );
      setSavedAt(Date.now());
      setLocalError(null);
    },
  });

  const data = query.data
    ? normalizePreferencesResponse(query.data)
    : undefined;

  const cellMap = useMemo(() => {
    const map = new Map<string, NotificationPreferenceCell>();
    if (data) {
      for (const cell of data.preferences) {
        map.set(cellKey(cell.event_type, cell.channel), cell);
      }
    }
    return map;
  }, [data]);

  function toggle(event: string, channel: NotificationChannel, next: boolean) {
    setLocalError(null);
    startTransition(() => {
      mutation.mutate({ event_type: event, channel, enabled: next });
    });
  }

  if (query.isError && !data) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {messageErreur(query.error)}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>;
  }

  const channels = data.channels;
  const displayError = localError ?? (query.error ? messageErreur(query.error) : null);

  return (
    <div className="space-y-6">
      {displayError ? (
        <p role="alert" className="text-sm text-red-600">
          {displayError}
        </p>
      ) : null}

      {!data.phone_verified ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t('smsDisabled')}{' '}
          <Link href="/app/profile" className="font-semibold underline">
            {t('verifyPhone')}
          </Link>
        </p>
      ) : null}

      {savedAt ? (
        <p role="status" aria-live="polite" className="text-xs text-emerald-700">
          {t('saved')}
        </p>
      ) : null}

      {GROUPS.map((group) => (
        <section key={group.key} className="rounded-2xl border border-border bg-white">
          <header className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">{t(`groups.${group.key}`)}</h3>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">{t('eventColumn')}</th>
                  {channels.map((channel) => (
                    <th key={channel} className="px-4 py-2 text-center">
                      {t(`channels.${channel}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.events.map((event) => (
                  <tr key={event} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">
                      {labelEvenement(event)}
                    </td>
                    {channels.map((channel) => {
                      const cell = cellMap.get(cellKey(event, channel));
                      if (!cell) return <td key={channel} className="px-4 py-2 text-center">—</td>;
                      const title =
                        cell.reason === 'inapp_always_on'
                          ? t('reasons.inappAlwaysOn')
                          : cell.reason === 'phone_not_verified'
                            ? t('reasons.phoneNotVerified')
                            : undefined;
                      return (
                        <td key={channel} className="px-4 py-2 text-center">
                          <label
                            className={
                              'inline-flex cursor-pointer items-center ' +
                              (cell.locked ? 'cursor-not-allowed opacity-60' : '')
                            }
                            title={title}
                          >
                            <input
                              type="checkbox"
                              disabled={cell.locked || mutation.isPending}
                              checked={cell.enabled}
                              onChange={(e) => toggle(event, channel, e.target.checked)}
                              aria-label={t('toggleAria', { event: labelEvenement(event), channel: t(`channels.${channel}`) })}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => queryClient.invalidateQueries({ queryKey: PREFS_KEY })}
        >
          {t('refresh')}
        </Button>
      </div>
    </div>
  );
}
