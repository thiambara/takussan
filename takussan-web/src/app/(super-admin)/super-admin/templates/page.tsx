'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mails } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useQuery } from '@tanstack/react-query';
import {
  NotificationEventList,
  TemplateEditor,
} from '@/components/admin/super/notification-templates';
import { fetchNotificationTemplates } from '@/lib/queries/super-admin';
import type { NotificationTemplateChannel, NotificationTemplatesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuperAdminTemplatesPage() {
  const t = useTranslations('superAdmin.templates');
  const tPage = useTranslations('superAdmin.pages.templates');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
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
      <PageHeader
        title={tPage('title')}
        description={tPage('subtitle')}
      />
      {query.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : query.isError ? (
        <ErrorState
          message={`${tShared('loadError')} ${messageErreur(query.error)}`}
          onRetry={() => void query.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : selected ? (
        <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          {/* Liste + panneau dès `xl` : à 1024 la coque laisse 720 px, 280 px de liste ne laissaient
            que 424 px à l'éditeur. `items-start` : la liste ne s'étire plus
            sur toute la hauteur de la table. */}
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
