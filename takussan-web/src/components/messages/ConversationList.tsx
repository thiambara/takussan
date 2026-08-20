'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
      <div className="space-y-2 p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-stone-100" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="p-4 text-sm text-red-600">
        {t('list.loadError')}
      </p>
    );
  }

  const conversations = data?.data ?? [];

  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-stone-500">
        {t('list.empty')}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-stone-100">
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
        className={cn(
          'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-stone-50',
          selected && 'bg-stone-100',
        )}
      >
        {isGroup ? (
          <div
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
            data-testid="group-avatar-stack"
          >
            <Users className="size-5" aria-hidden />
            {groupParticipants.length > 0 && (
              <span className="absolute -bottom-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-700 px-1 text-[9px] font-bold text-white">
                +{groupParticipants.length}
              </span>
            )}
          </div>
        ) : (
          <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-stone-200">
            {conversation.property?.main_photo_url ? (
              <Image
                src={conversation.property.main_photo_url}
                alt=""
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : null}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                'truncate text-sm',
                unread > 0 ? 'font-semibold text-stone-900' : 'text-stone-800',
              )}
            >
              {conversation.subject ||
                conversation.property?.title ||
                t('conversationTitleFallback', { id: String(conversation.id) })}
            </p>
            {conversation.last_message_at && (
              <span className="text-[10px] text-stone-400">
                {formatDate(conversation.last_message_at, locale, { dateStyle: 'short' })}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {isGroup && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase">
                {t('list.groupBadge')}
              </Badge>
            )}
            {isMuted && (
              <span className="text-[10px]" aria-label={t('list.muted')} title={t('list.muted')}>
                🔕
              </span>
            )}
            <p
              className={cn(
                'truncate text-xs',
                unread > 0 ? 'text-stone-700' : 'text-stone-500',
              )}
            >
              {conversation.last_message_preview ?? '—'}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <span className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-app-topbar text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </li>
  );
}
