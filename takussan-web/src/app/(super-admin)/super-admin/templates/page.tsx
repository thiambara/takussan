'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mails } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { useQuery } from '@tanstack/react-query';
import {
  NotificationEventList,
  TemplateEditor,
} from '@/components/admin/super/notification-templates';
import { fetchNotificationTemplates } from '@/lib/queries/super-admin';
import type { NotificationTemplateChannel, NotificationTemplatesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export default function SuperAdminTemplatesPage() {
  const t = useTranslations('superAdmin.templates');
  const tPage = useTranslations('superAdmin.pages.templates');
  const tShared = useTranslations('superAdmin.pages.shared');
  const messageErreur = useMessageErreurApi();
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
        <h1 className="font-display text-2xl font-bold text-foreground">{tPage('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tPage('subtitle')}</p>
      </header>
      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          {tShared('loadError')} {messageErreur(query.error)}
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
        <EmptyState
          icon={<Mails className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      )}
    </div>
  );
}
