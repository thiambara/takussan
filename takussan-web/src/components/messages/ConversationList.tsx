'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { BellOff, Building2, MessagesSquare, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/feedback';
import { formatDate } from '@/lib/format';
import { useConversations } from '@/lib/queries/conversations';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/config';
import type { Conversation } from '@/types/message';

interface ConversationListProps {
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const t = useTranslations('messaging');
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  // List polls every 10 s to surface new conversations / unread badges.
  const { data, isLoading, isError } = useConversations();

  if (isLoading) {
    return (
      <div className="space-y-2 p-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-3">
        <ErrorState message={t('list.loadError')} />
      </div>
    );
  }

  const conversations = data?.data ?? [];

  if (conversations.length === 0) {
    return (
      <EmptyState
        className="m-3"
        icon={<MessagesSquare className="size-8" aria-hidden="true" />}
        title={t('list.empty')}
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {conversations.map((c) => (
        <ConversationRow
          key={c.id}
          conversation={c}
          selected={c.id === selectedId}
          onSelect={onSelect}
          locale={locale}
          currentUserId={user?.id}
        />
      ))}
    </ul>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
  locale,
  currentUserId,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: number) => void;
  locale: Locale;
  currentUserId?: number;
}) {
  const t = useTranslations('messaging');
  const unread = conversation.unread_count ?? 0;
  const isGroup = conversation.type === 'group';
  const myParticipant = conversation.participants?.find(
    (p) => p.user_id === currentUserId && !p.left_at,
  );
  const isMuted = Boolean(myParticipant?.is_muted);
  const groupParticipants = (conversation.participants ?? []).filter(
    (p) => !p.left_at,
  );
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          selected && 'bg-muted hover:bg-muted',
        )}
      >
        {isGroup ? (
          <div
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            data-testid="group-avatar-stack"
          >
            <Users className="size-5" aria-hidden />
            {groupParticipants.length > 0 && (
              <span className="absolute -bottom-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold tabular-nums text-background ring-2 ring-card">
                +{groupParticipants.length}
              </span>
            )}
          </div>
        ) : (
          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
            {conversation.property?.main_photo_url ? (
              <Image
                src={conversation.property.main_photo_url}
                alt=""
                fill
                sizes="40px"
                className="object-cover outline -outline-offset-1 outline-foreground/10"
              />
            ) : (
              // Sans photo, le rond restait VIDE : 22 disques beiges identiques (mesuré).
              <Building2 className="size-5" aria-hidden />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                'truncate text-sm',
                unread > 0 ? 'font-semibold text-foreground' : 'text-foreground',
              )}
            >
              {conversation.subject ||
                conversation.property?.title ||
                t('conversationTitleFallback', { id: String(conversation.id) })}
            </p>
            {conversation.last_message_at && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDate(conversation.last_message_at, locale, { dateStyle: 'short' })}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {isGroup && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[11px]">
                {t('list.groupBadge')}
              </Badge>
            )}
            {isMuted && (
              <BellOff
                className="size-3.5 shrink-0 text-muted-foreground"
                role="img"
                aria-label={t('list.muted')}
              />
            )}
            <p
              className={cn(
                'truncate text-xs',
                unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {conversation.last_message_preview ?? '—'}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <span className="ml-1 inline-flex size-5 shrink-0 items-center justify-center self-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </li>
  );
}
