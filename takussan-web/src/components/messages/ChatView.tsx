'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Info, Paperclip, Send, Settings, Users } from 'lucide-react';
import {
  useConversation,
  useMessagesInfinite,
  useNewMessagesPolling,
  useSendMessage,
} from '@/lib/queries/conversations';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import { isAllowedAttachment, sendMessageSchema, type SendMessageFormValues } from '@/lib/schemas/message';
import { cn } from '@/lib/utils';
import { SystemMessageBubble } from './SystemMessageBubble';
import { ConversationInfoSheet } from './ConversationInfoSheet';
import { MessageDateSeparator } from './MessageDateSeparator';
import { groupMessagesByDay } from '@/lib/messages/groupByDay';
import type { Locale } from '@/i18n/config';
import type { Message } from '@/types/message';

interface ChatViewProps {
  readonly conversationId: number;
  /**
   * `page` (default) renders the full-page chat with the in-place group info
   * sheet (TCK-085). `widget` is the compact variant used by the floating
   * chat widget (TCK-274): it adds a back button to the header, drops the
   * group info sheet, and replaces the info button with a link to the full
   * `/app/messages` page so admin actions stay in their dedicated UI.
   */
  readonly variant?: 'page' | 'widget';
  /** Required when `variant === 'widget'` to render the back button. */
  readonly onBack?: () => void;
}

/**
 * Realtime strategy: `useMessagesInfinite` loads 30 newest messages on mount
 * and pages older history when the user scrolls up; `useNewMessagesPolling`
 * polls `?after_id=<latest>` every 3 s and merges results into the same cache
 * so polling never re-downloads loaded history. Polling pauses while the tab
 * is hidden (visibility listener below). See TCK-045 / pagination plan.
 */
export function ChatView({ conversationId, variant = 'page', onBack }: ChatViewProps) {
  const isWidget = variant === 'widget';
  const tWidget = useTranslations('messaging.widget');
  const locale = useLocale() as Locale;
  const { user, token } = useAuth();
  const [isVisible, setIsVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLLIElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const { data: conversationData } = useConversation(conversationId);
  const {
    data: infiniteData,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMessagesInfinite(conversationId);

  const messages = useMemo<Message[]>(
    () => infiniteData?.pages.flatMap((p) => p.data) ?? [],
    [infiniteData],
  );

  const anchorId = useMemo<number | null>(() => {
    if (messages.length === 0) return null;
    let max = messages[0]!.id;
    for (const m of messages) if (m.id > max) max = m.id;
    return max;
  }, [messages]);

  useNewMessagesPolling(conversationId, anchorId, { enabled: isVisible });

  const sendMessage = useSendMessage(conversationId);

  const form = useForm<SendMessageFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(sendMessageSchema as unknown as any),
    defaultValues: { content: '' },
  });

  const conversation = conversationData?.data;
  const isGroup = conversation?.type === 'group';
  const myParticipant = conversation?.participants?.find(
    (p) => p.user_id === user?.id && !p.left_at,
  );
  const isMuted = Boolean(myParticipant?.is_muted);

  // Reset the per-conversation scroll bookkeeping whenever the open
  // conversation changes — otherwise the dashboard's persistent ChatView
  // would carry the previous conversation's `hasScrolledOnLoadRef = true`
  // and skip the auto-scroll-to-bottom for every subsequent conversation.
  const hasScrolledOnLoadRef = useRef(false);
  const lastIncomingIdRef = useRef<number | null>(null);
  const scrollHeightBeforeFetchRef = useRef<number | null>(null);
  useEffect(() => {
    hasScrolledOnLoadRef.current = false;
    lastIncomingIdRef.current = null;
    scrollHeightBeforeFetchRef.current = null;
  }, [conversationId]);

  // Auto-scroll when the newest message id changes (incoming via polling or
  // sent locally) — but only if the user is already near the bottom, so we
  // don't yank them out of their history reading.
  useEffect(() => {
    if (anchorId == null) return;
    if (lastIncomingIdRef.current === anchorId) return;
    lastIncomingIdRef.current = anchorId;

    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [anchorId]);

  // Initial-load scroll: when the first batch of messages is painted, wait
  // for the layout pass (rAF) so `scrollHeight` reflects every bubble
  // (including images / attachments) before jumping to the bottom. The ref
  // is reset on `conversationId` change above so this fires per-conversation.
  useEffect(() => {
    if (hasScrolledOnLoadRef.current) return;
    if (isLoading || messages.length === 0) return;
    hasScrolledOnLoadRef.current = true;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [isLoading, messages.length]);

  // Preserve scroll position when older history is prepended on scroll-up.
  // Capture `scrollHeight` right before triggering `fetchNextPage`, then
  // after the new page is rendered, restore the visual offset by adding the
  // delta to `scrollTop`.
  const pagesLength = infiniteData?.pages.length ?? 0;
  const prevPagesLengthRef = useRef(pagesLength);
  useEffect(() => {
    if (pagesLength > prevPagesLengthRef.current && scrollHeightBeforeFetchRef.current != null) {
      const saved = scrollHeightBeforeFetchRef.current;
      scrollHeightBeforeFetchRef.current = null;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight - saved;
      });
    }
    prevPagesLengthRef.current = pagesLength;
  }, [pagesLength]);

  // IntersectionObserver on the top sentinel triggers older-history fetch.
  const isSentinelVisible = useIntersectionObserver(loadMoreRef, {
    root: scrollRef,
    rootMargin: '120px 0px 0px 0px',
    enabled: Boolean(hasNextPage) && !isLoading,
  });
  useEffect(() => {
    if (!isSentinelVisible || !hasNextPage || isFetchingNextPage || isLoading) return;
    if (scrollRef.current) {
      scrollHeightBeforeFetchRef.current = scrollRef.current.scrollHeight;
    }
    void fetchNextPage();
  }, [isSentinelVisible, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const renderItems = groupMessagesByDay(messages);

  async function uploadAttachment(messageId: number, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    await apiRequest(
      `/api/conversations/${conversationId}/messages/${messageId}/attachments`,
      {
        method: 'POST',
        body: fd,
        formData: true,
        token: token ?? undefined,
      },
    );
  }

  async function onSubmit(values: SendMessageFormValues) {
    try {
      const result = await sendMessage.mutateAsync({ content: values.content });
      form.reset({ content: '' });

      const pendingFile = fileInputRef.current?.files?.[0];
      if (pendingFile) {
        const validation = isAllowedAttachment(pendingFile);
        if (!validation.ok) {
          setAttachmentError(validation.reason ?? 'Fichier refusé.');
        } else {
          setUploading(true);
          try {
            await uploadAttachment(result.data.id, pendingFile);
          } catch (err) {
            setAttachmentError(err instanceof Error ? err.message : 'Upload échoué.');
          } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }
      }
    } catch {
      // Global error is surfaced via the mutation state
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachmentError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const v = isAllowedAttachment(file);
    if (!v.ok) {
      setAttachmentError(v.reason ?? 'Fichier refusé.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        {isWidget && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label={tWidget('chatBack')}
            data-testid="chat-back-button"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        )}
        {isGroup ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-stone-200">
            <Users className="size-5 text-stone-600" aria-hidden />
          </div>
        ) : conversation?.property ? (
          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-stone-100">
            {conversation.property.main_photo_url && (
              <Image
                src={conversation.property.main_photo_url}
                alt=""
                fill
                sizes="40px"
                className="object-cover"
              />
            )}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-stone-900">
            {conversation?.subject ??
              conversation?.property?.title ??
              `Conversation #${conversationId}`}
          </h2>
          {isGroup && conversation?.participants && (
            <p className="text-xs text-stone-500">
              {conversation.participants.filter((p) => !p.left_at).length} participants
              {isMuted && ' · 🔕'}
            </p>
          )}
          {!isGroup && conversation?.property && (
            <Link
              href={`/properties/${conversation.property.slug}`}
              className="text-xs text-stone-500 hover:underline"
            >
              Voir le bien
            </Link>
          )}
        </div>
        {isGroup && !isWidget && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setInfoOpen(true)}
            aria-label="Group info"
            data-testid="group-info-button"
          >
            <Info className="size-4" aria-hidden />
          </Button>
        )}
        {isGroup && isWidget && (
          <Link
            href={`/app/messages?conversation=${conversationId}`}
            className="inline-flex size-9 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100"
            aria-label={tWidget('manageGroup')}
            data-testid="chat-manage-group-link"
          >
            <Settings className="size-4" aria-hidden />
          </Link>
        )}
      </header>
      {isGroup && !isWidget && (
        <ConversationInfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
          currentMute={isMuted}
        />
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-stone-50 px-4 py-4"
      >
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-stone-200" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-lg bg-stone-200" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600">Impossible de charger les messages.</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-stone-500">
            Pas encore de messages. Envoyez le premier !
          </p>
        ) : (
          <ul className="space-y-3">
            <li
              ref={loadMoreRef}
              aria-hidden={!hasNextPage}
              className={cn(
                'flex justify-center',
                hasNextPage ? 'py-2' : 'py-0',
              )}
            >
              {isFetchingNextPage ? (
                <span className="text-[11px] text-stone-500">Chargement…</span>
              ) : null}
            </li>
            {renderItems.map((item) => {
              if (item.kind === 'separator') {
                return <MessageDateSeparator key={item.key} date={item.date} />;
              }
              const m = item.message;
              return m.type === 'system' ? (
                <SystemMessageBubble key={m.id} message={m} />
              ) : (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isOwn={m.sender_id === user?.id}
                  locale={locale}
                />
              );
            })}
          </ul>
        )}
      </div>

      <form
        // TCK-316 — `handleSubmit(onSubmit)` était APPELÉ pendant le rendu pour
        // produire le gestionnaire, et `onSubmit` lit `fileInputRef.current` :
        // le compilateur ne peut pas prouver que la ref n'est pas lue au rendu.
        // On diffère l'appel dans l'événement, ce que fait déjà le bouton plus bas.
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="border-t border-stone-200 bg-white p-3"
      >
        {attachmentError && (
          <p className="mb-2 text-xs text-red-600">{attachmentError}</p>
        )}
        <div className="flex items-end gap-2">
          <label
            htmlFor="chat-file"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
            aria-label="Joindre un fichier"
          >
            <Paperclip className="size-4" aria-hidden />
            <input
              id="chat-file"
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx"
              className="sr-only"
              onChange={handleFilePicked}
            />
          </label>
          <Textarea
            {...form.register('content')}
            rows={1}
            placeholder="Écrivez un message…"
            className="min-h-9 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void form.handleSubmit(onSubmit)();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={sendMessage.isPending || uploading}
            aria-label="Envoyer"
          >
            <Send className="size-4" aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  locale,
}: {
  message: Message;
  isOwn: boolean;
  locale: Locale;
}) {
  return (
    <li className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          isOwn
            ? 'rounded-br-sm bg-app-topbar text-white'
            : 'rounded-bl-sm bg-white text-stone-900',
        )}
      >
        {!isOwn && message.sender && (
          <p className="mb-0.5 text-[10px] font-semibold text-stone-500">
            {message.sender.full_name}
          </p>
        )}
        <p className="whitespace-pre-line break-words">{message.content}</p>
        {message.attachments && message.attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1 text-xs underline',
                    isOwn ? 'text-white/90' : 'text-app-topbar',
                  )}
                >
                  <Paperclip className="size-3" aria-hidden />
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p
          className={cn(
            'mt-1 text-[10px]',
            isOwn ? 'text-white/70' : 'text-stone-400',
          )}
        >
          {formatDateTime(message.created_at, locale, { timeStyle: 'short', dateStyle: undefined })}
        </p>
      </div>
    </li>
  );
}
