'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { Paperclip, Send } from 'lucide-react';
import {
  useConversation,
  useMessages,
  useSendMessage,
} from '@/lib/queries/conversations';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import { isAllowedAttachment, sendMessageSchema, type SendMessageFormValues } from '@/lib/schemas/message';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/config';
import type { Message } from '@/types/message';

interface ChatViewProps {
  readonly conversationId: number;
}

/**
 * Realtime strategy: `useMessages` polls every 3 s while the tab is focused.
 * When the tab is hidden we pause polling to save bandwidth (document
 * visibility listener below). See TCK-045 Notes d'implémentation.
 */
export function ChatView({ conversationId }: ChatViewProps) {
  const locale = useLocale() as Locale;
  const { user, token } = useAuth();
  const [isVisible, setIsVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const { data: conversationData } = useConversation(conversationId);
  const {
    data: messagesData,
    isLoading,
    isError,
  } = useMessages(conversationId, {
    refetchInterval: isVisible ? 3_000 : false,
  });

  const sendMessage = useSendMessage(conversationId);

  const form = useForm<SendMessageFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(sendMessageSchema as unknown as any),
    defaultValues: { content: '' },
  });

  const messages = messagesData?.data ?? [];
  const conversation = conversationData?.data;

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

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
        {conversation?.property && (
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
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-stone-900">
            {conversation?.subject ??
              conversation?.property?.title ??
              `Conversation #${conversationId}`}
          </h2>
          {conversation?.property && (
            <Link
              href={`/properties/${conversation.property.slug}`}
              className="text-xs text-stone-500 hover:underline"
            >
              Voir le bien
            </Link>
          )}
        </div>
      </header>

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
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.sender_id === user?.id}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
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
