'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
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

/**
 * TCK-070 — event_type × channel matrix. Renders the backend-provided
 * grid and lets the user toggle individual cells. Save-on-click — each
 * toggle triggers a PATCH, the button flashes "Enregistré" on success.
 *
 * The `locked` flag on a cell (e.g. inapp always-on, sms without a
 * verified phone) disables it and shows the reason inline.
 */

// Display labels & grouping live on the frontend only (keeps the backend
// free of UI copy). Must mirror `PreferenceResolver::EVENTS`.
const EVENT_LABELS: Record<string, string> = {
  message_received: 'Nouveau message',
  booking_request: 'Demande de réservation',
  booking_status_changed: 'Réservation — statut modifié',
  lease_payment_due: 'Loyer — échéance',
  lease_payment_overdue: 'Loyer — retard',
  maintenance_status_changed: 'Maintenance — statut',
  review_received: 'Nouvel avis',
  saved_search_match: 'Recherche sauvegardée',
  visit_reminder: 'Rappel de visite',
  threshold_alert: 'Alerte seuil KPI',
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  inapp: 'In-app',
  email: 'Email',
  push: 'Push',
  sms: 'SMS',
};

const GROUPS: { title: string; events: string[] }[] = [
  { title: 'Messages', events: ['message_received'] },
  {
    title: 'Réservations',
    events: ['booking_request', 'booking_status_changed'],
  },
  { title: 'Baux', events: ['lease_payment_due', 'lease_payment_overdue'] },
  { title: 'Maintenance', events: ['maintenance_status_changed'] },
  { title: 'Avis', events: ['review_received'] },
  { title: 'Alertes', events: ['saved_search_match', 'visit_reminder', 'threshold_alert'] },
];

const PREFS_KEY = ['notifications', 'preferences'] as const;

function cellKey(event: string, channel: string): string {
  return `${event}|${channel}`;
}

export function NotificationPreferencesMatrix() {
  const queryClient = useQueryClient();
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
      setLocalError(err.message);
      if (context?.previous) {
        queryClient.setQueryData(PREFS_KEY, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PREFS_KEY, data);
      setSavedAt(Date.now());
      setLocalError(null);
    },
  });

  const data = query.data;

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
        {query.error.message}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-app-ink-muted">Chargement…</p>;
  }

  const channels = data.channels;
  const displayError = localError ?? query.error?.message ?? null;

  return (
    <div className="space-y-6">
      {displayError ? (
        <p role="alert" className="text-sm text-red-600">
          {displayError}
        </p>
      ) : null}

      {!data.phone_verified ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Les notifications SMS sont désactivées tant que votre téléphone
          n&apos;est pas vérifié.{' '}
          <Link href="/app/profile" className="font-semibold underline">
            Vérifier mon téléphone
          </Link>
        </p>
      ) : null}

      {savedAt ? (
        <p role="status" aria-live="polite" className="text-xs text-emerald-700">
          Préférences enregistrées.
        </p>
      ) : null}

      {GROUPS.map((group) => (
        <section key={group.title} className="rounded-2xl border border-app-surface-3 bg-white">
          <header className="border-b border-app-surface-3 px-4 py-3">
            <h3 className="text-sm font-bold text-app-ink">{group.title}</h3>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-app-ink-muted">
                <tr>
                  <th className="px-4 py-2">Événement</th>
                  {channels.map((channel) => (
                    <th key={channel} className="px-4 py-2 text-center">
                      {CHANNEL_LABELS[channel]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.events.map((event) => (
                  <tr key={event} className="border-t border-app-surface-3">
                    <td className="px-4 py-2 text-app-ink">
                      {EVENT_LABELS[event] ?? event}
                    </td>
                    {channels.map((channel) => {
                      const cell = cellMap.get(cellKey(event, channel));
                      if (!cell) return <td key={channel} className="px-4 py-2 text-center">—</td>;
                      const title =
                        cell.reason === 'inapp_always_on'
                          ? 'Toujours actif pour ne rien manquer.'
                          : cell.reason === 'phone_not_verified'
                            ? 'Téléphone non vérifié.'
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
                              aria-label={`${EVENT_LABELS[event] ?? event} — ${CHANNEL_LABELS[channel]}`}
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
          Rafraîchir
        </Button>
      </div>
    </div>
  );
}
