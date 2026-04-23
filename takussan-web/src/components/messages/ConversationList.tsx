'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { formatDate } from '@/lib/format';
import { useConversations } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/config';
import type { Conversation } from '@/types/message';

interface ConversationListProps {
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const locale = useLocale() as Locale;
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
        Impossible de charger les conversations.
      </p>
    );
  }

  const conversations = data?.data ?? [];

  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-stone-500">
        Pas encore de conversation.
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
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: number) => void;
  locale: Locale;
}) {
  const unread = conversation.unread_count ?? 0;
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
                `Conversation #${conversation.id}`}
            </p>
            {conversation.last_message_at && (
              <span className="text-[10px] text-stone-400">
                {formatDate(conversation.last_message_at, locale, { dateStyle: 'short' })}
              </span>
            )}
          </div>
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              unread > 0 ? 'text-stone-700' : 'text-stone-500',
            )}
          >
            {conversation.last_message_preview ?? '—'}
          </p>
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
