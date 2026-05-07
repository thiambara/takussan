'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  NotificationEventList,
  TemplateEditor,
} from '@/components/admin/super/notification-templates';
import { fetchNotificationTemplates } from '@/lib/queries/super-admin';
import type { NotificationTemplateChannel, NotificationTemplatesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminTemplatesPage() {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<NotificationTemplateChannel>('email');
  const query = useQuery<NotificationTemplatesResponse, ApiError>({
    queryKey: ['super-admin', 'notification-templates'],
    queryFn: fetchNotificationTemplates,
    staleTime: 30_000,
  });
  const items = useMemo(() => query.data?.data ?? [], [query.data]);
  const activeEvent = selectedEvent ?? items[0]?.event ?? '';
  const selected = items.find((item) => item.event === activeEvent && item.channel === selectedChannel)
    ?? items.find((item) => item.event === activeEvent)
    ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-900">Templates de notification</h1>
        <p className="mt-1 text-sm text-stone-600">
          Contenus localisés FR / EN / WO pour les notifications email, SMS et push.
        </p>
      </header>
      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-stone-200" />
      ) : query.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : selected ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <NotificationEventList
            items={items}
            selected={selected.event}
            onSelect={(event) => {
              setSelectedEvent(event);
              setSelectedChannel('email');
            }}
          />
          <TemplateEditor
            key={`${selected.event}:${selected.channel}`}
            detail={selected}
            onChannelSelect={setSelectedChannel}
          />
        </div>
      ) : (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-stone-600 ring-1 ring-stone-200">
          Aucun template éditable.
        </div>
      )}
    </div>
  );
}
