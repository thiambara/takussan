'use client';

import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type {
  Conversation,
  Message,
  MessageAttachment,
  PropertyConversationResolution,
} from '@/types/message';

/**
 * React Query hooks for Conversations and Messages (TCK-045).
 *
 * Realtime: we rely on React Query's `refetchInterval` (3 s for the messages
 * of the currently open conversation, 10 s for the list) rather than
 * WebSockets. The stale time is pushed down so new messages surface fast
 * even when the user tabs back in. See ticket Notes d'implémentation.
 */

const CONVERSATION_LIST_FIELDS: string[] = [
  'id',
  'subject',
  'property_id',
  'type',
  'status',
  'last_message_at',
  'last_message_preview',
  'updated_at',
];

/**
 * Colonnes du bien attaché à une conversation (TCK-336).
 *
 * Constante EXPORTÉE et non deux littéraux recopiés : `property-fields.coverage.test.ts`
 * la compare aux clés que `ConversationList` et `ChatView` lisent réellement, et une garde
 * ne peut pas comparer ce qui n'a pas de nom.
 *
 * ⚠ `main_photo_url` — que les deux composants affichent — n'y figure pas et ne peut pas
 * y figurer : c'est un attribut calculé (media library), pas une colonne. Mesuré le
 * 2026-08-21 : `GET /api/properties?fields[properties]=id,title,main_photo_url` rend
 * **400 InvalidFieldQuery**. Le contrat de TCK-336 est donc que `PropertyResource` le
 * serve INCONDITIONNELLEMENT, quel que soit `fields[]`.
 */
export const CONVERSATION_PROPERTY_FIELDS: string[] = ['id', 'title', 'slug'];

const MESSAGE_LIST_FIELDS: string[] = [
  'id',
  'conversation_id',
  'sender_id',
  'content',
  'type',
  'created_at',
];

/**
 * TCK-500 — « ce bien, ai-je déjà un fil dessus, et ai-je le droit d'écrire ? »
 *
 * Deux écrans la posent : la fiche du bien (pour décider si le bouton « Envoyer un message » a
 * un sens, et quoi ouvrir au clic) et la messagerie pleine page quand elle est atteinte depuis
 * un mobile avec `?property=<slug>`.
 *
 * ⚠️ **Lecture pure.** L'endpoint ne crée rien : la conversation naît du premier message, pas de
 * l'ouverture de l'écran. Le hook peut donc être monté sans conséquence.
 *
 * Gardée sur `user` comme `useConversations` : la route est `auth:sanctum`, et la fiche d'un bien
 * est massivement vue par des visiteurs anonymes — sans cette garde, chaque visite publique
 * partirait chercher un 401.
 */
export function propertyConversationQueryKey(slug: string | null): QueryKey {
  return ['conversations', 'property', slug];
}

export function usePropertyConversation(slug: string | null, options: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const enabled = (options.enabled ?? true) && Boolean(user) && Boolean(slug);

  return useApiQuery<ApiResponse<PropertyConversationResolution>>(
    propertyConversationQueryKey(slug),
    `/api/public/properties/${slug}/conversation`,
    { enabled, staleTime: 30_000 },
  );
}

export type UseConversationsParams = {
  status?: 'active' | 'archived' | 'closed';
  property_id?: number;
  page?: number;
  per_page?: number;
};

export function useConversations(
  params: UseConversationsParams = {},
  options: { refetchInterval?: number | false; enabled?: boolean } = {},
) {
  // `/api/conversations` is auth-only (auth:sanctum). Gate at the source so no
  // caller (e.g. the globally-mounted ChatWidget badge) ever polls it for an
  // anonymous visitor. In authenticated contexts `user` is always set, so this
  // is a no-op there.
  const { user } = useAuth();
  const enabled = (options.enabled ?? true) && Boolean(user);

  const filter: Record<string, string | number> = {};
  if (params.status) filter.status = params.status;
  if (params.property_id) filter.property_id = params.property_id;

  const spatieParams: SpatieQueryParams = {
    fields: {
      conversations: CONVERSATION_LIST_FIELDS,
      properties: CONVERSATION_PROPERTY_FIELDS,
    },
    filter,
    include: ['property', 'participants', 'last_message'],
    sort: ['-last_message_at'],
    page: params.page ?? 1,
    per_page: params.per_page ?? 30,
  };

  return useApiQuery<PaginatedResponse<Conversation>>(
    ['conversations', 'list', params],
    '/api/conversations',
    {
      params: spatieParams,
      enabled,
      refetchInterval: options.refetchInterval ?? 10_000,
      staleTime: 0,
    },
  );
}

export function useConversation(id: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      conversations: [
        ...CONVERSATION_LIST_FIELDS,
        'lease_id',
        'maintenance_request_id',
        'created_by',
        'created_at',
      ],
      properties: CONVERSATION_PROPERTY_FIELDS,
    },
    include: ['property', 'participants'],
  };

  return useApiQuery<ApiResponse<Conversation>>(
    ['conversations', 'detail', id],
    `/api/conversations/${id ?? ''}`,
    {
      params: spatieParams,
      enabled: Boolean(id),
    },
  );
}

/**
 * Cursor-paginated history. The first page (no cursor) returns the newest
 * `MESSAGES_PAGE_SIZE` messages, and each subsequent `fetchNextPage` sends
 * `before_id = <oldest loaded id>` to load older history. The list is kept
 * newest-first inside each page; `ChatView`'s `groupMessagesByDay` re-sorts
 * ascending for rendering.
 *
 * Polling for new messages lives in `useNewMessagesPolling` — it merges its
 * result back into this query's cache via `setQueryData`. That way the
 * infinite query is the single source of truth and polling never re-fetches
 * already-loaded history.
 */
export const MESSAGES_PAGE_SIZE = 30;

export type MessagesPage = {
  data: Message[];
  meta: { has_more: boolean };
};

export function messagesInfiniteQueryKey(
  conversationId: number | null | undefined,
): QueryKey {
  return ['conversations', conversationId, 'messages-infinite'];
}

export function useMessagesInfinite(conversationId: number | null | undefined) {
  const locale = useLocale();
  const { token } = useAuth();

  return useInfiniteQuery<MessagesPage, ApiError, InfiniteData<MessagesPage>, QueryKey, number | undefined>({
    queryKey: messagesInfiniteQueryKey(conversationId),
    enabled: Boolean(conversationId),
    initialPageParam: undefined,
    staleTime: 0,
    queryFn: async ({ pageParam, signal }) => {
      const params: SpatieQueryParams = {
        fields: { messages: MESSAGE_LIST_FIELDS },
        include: ['sender', 'attachments'],
        per_page: MESSAGES_PAGE_SIZE,
        extra: pageParam != null ? { before_id: pageParam } : undefined,
      };
      const qs = buildQueryString(params);
      const path = `/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`;
      return apiRequest<MessagesPage>(path, {
        token: token ?? undefined,
        locale,
        signal,
      });
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.meta.has_more || lastPage.data.length === 0) return undefined;
      return lastPage.data[lastPage.data.length - 1]!.id;
    },
  });
}

/**
 * Merge fresh messages (typically from `after_id` polling or the response of
 * `useSendMessage`) into `pages[0]` of the infinite-query cache, deduped by
 * `id`, preserving newest-first ordering.
 */
export function mergeNewMessages(
  cache: InfiniteData<MessagesPage> | undefined,
  incoming: readonly Message[],
): InfiniteData<MessagesPage> | undefined {
  if (!cache) return cache;
  if (incoming.length === 0) return cache;

  const knownIds = new Set<number>();
  for (const page of cache.pages) {
    for (const m of page.data) knownIds.add(m.id);
  }

  const additions = incoming.filter((m) => !knownIds.has(m.id));
  if (additions.length === 0) return cache;

  // Newest-first: largest id at index 0.
  const sortedAdditions = [...additions].sort((a, b) => b.id - a.id);
  const firstPage = cache.pages[0] ?? { data: [], meta: { has_more: false } };
  const nextFirstPage: MessagesPage = {
    ...firstPage,
    data: [...sortedAdditions, ...firstPage.data],
  };

  return {
    ...cache,
    pages: [nextFirstPage, ...cache.pages.slice(1)],
  };
}

/**
 * Polls `?after_id=<anchorId>` every 3 s when the tab is visible and feeds
 * the returned messages into the infinite-query cache. Pass the highest id
 * already in the client cache as `anchorId`.
 */
export function useNewMessagesPolling(
  conversationId: number | null | undefined,
  anchorId: number | null,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const enabled = (options.enabled ?? true) && Boolean(conversationId) && anchorId != null;

  const query = useApiQuery<{ data: Message[] }>(
    ['conversations', conversationId, 'messages', 'live', anchorId],
    `/api/conversations/${conversationId ?? ''}/messages`,
    {
      enabled,
      params: {
        fields: { messages: MESSAGE_LIST_FIELDS },
        include: ['sender', 'attachments'],
        extra: anchorId != null ? { after_id: anchorId } : undefined,
      },
      refetchInterval: enabled ? 3_000 : false,
      staleTime: 0,
    },
  );

  useEffect(() => {
    if (!conversationId) return;
    const incoming = query.data?.data;
    if (!incoming || incoming.length === 0) return;
    queryClient.setQueryData<InfiniteData<MessagesPage>>(
      messagesInfiniteQueryKey(conversationId),
      (cache) => mergeNewMessages(cache, incoming),
    );
  }, [conversationId, query.data, queryClient]);

  return query;
}

export type SendMessagePayload = {
  content: string;
};

export function useSendMessage(conversationId: number) {
  const queryClient = useQueryClient();
  return useApiMutation<ApiResponse<Message>, SendMessagePayload>(
    {
      path: `/api/conversations/${conversationId}/messages`,
      method: 'POST',
    },
    {
      // We deliberately do NOT invalidate the infinite messages query — that
      // would refetch every loaded page. Instead, prepend the new message to
      // page 0 of the cache so it shows up immediately.
      invalidate: [
        ['conversations', 'list'],
        ['conversations', 'detail', conversationId],
      ],
      onSuccess: (response) => {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(
          messagesInfiniteQueryKey(conversationId),
          (cache) => mergeNewMessages(cache, [response.data]),
        );
      },
    },
  );
}

export type CreateConversationPayload = {
  property_id?: number;
  lease_id?: number;
  subject?: string;
  recipient_id?: number;
  initial_message: string;
};

export function useCreateConversation() {
  return useApiMutation<ApiResponse<Conversation>, CreateConversationPayload>(
    { path: '/api/conversations', method: 'POST' },
    { invalidate: [['conversations', 'list']] },
  );
}

/**
 * Upload an attachment — multipart/form-data. React Query's mutation typing
 * plays nicely with `FormData` if we tag the shape with `formData: true`.
 */
export type UploadAttachmentPayload = {
  file: File;
};

export function useUploadAttachment(conversationId: number, messageId: number) {
  return useApiMutation<ApiResponse<MessageAttachment>, UploadAttachmentPayload>(
    {
      path: `/api/conversations/${conversationId}/messages/${messageId}/attachments`,
      method: 'POST',
      formData: true,
      body: (vars) => {
        const fd = new FormData();
        fd.append('file', vars.file);
        return fd;
      },
    },
    {
      invalidate: [['conversations', conversationId, 'messages']],
    },
  );
}

// =============================================================================
// TCK-085 — Group conversations
// =============================================================================

export type CreateGroupConversationPayload = {
  type: 'group';
  subject: string;
  participants: number[];
  property_id?: number;
  lease_id?: number;
  maintenance_request_id?: number;
};

export function useCreateGroupConversation() {
  return useApiMutation<ApiResponse<Conversation>, CreateGroupConversationPayload>(
    { path: '/api/conversations', method: 'POST' },
    { invalidate: [['conversations', 'list']] },
  );
}

export type AddParticipantsPayload = {
  user_ids: number[];
  role?: 'member' | 'admin';
};

export function useAddParticipants(conversationId: number) {
  return useApiMutation<ApiResponse<{ added_user_ids: number[] }>, AddParticipantsPayload>(
    {
      path: `/api/conversations/${conversationId}/participants`,
      method: 'POST',
    },
    {
      invalidate: [
        ['conversations', 'detail', conversationId],
        ['conversations', conversationId, 'messages'],
      ],
    },
  );
}

export function useRemoveParticipant(conversationId: number) {
  return useApiMutation<ApiResponse<{ removed_user_id: number }>, { user_id: number }>(
    {
      path: ({ user_id }) =>
        `/api/conversations/${conversationId}/participants/${user_id}`,
      method: 'DELETE',
    },
    {
      invalidate: [
        ['conversations', 'detail', conversationId],
        ['conversations', conversationId, 'messages'],
        ['conversations', 'list'],
      ],
    },
  );
}

export type UpdateParticipantPayload = {
  user_id: number;
  role: 'member' | 'admin';
};

export function useUpdateParticipantRole(conversationId: number) {
  return useApiMutation<ApiResponse<{ user_id: number; role: 'member' | 'admin' }>, UpdateParticipantPayload>(
    {
      path: ({ user_id }) =>
        `/api/conversations/${conversationId}/participants/${user_id}`,
      method: 'PATCH',
      body: ({ role }) => ({ role }),
    },
    {
      invalidate: [
        ['conversations', 'detail', conversationId],
        ['conversations', conversationId, 'messages'],
      ],
    },
  );
}

export function useRenameConversation(conversationId: number) {
  return useApiMutation<ApiResponse<Conversation>, { subject: string }>(
    {
      path: `/api/conversations/${conversationId}`,
      method: 'PATCH',
    },
    {
      invalidate: [
        ['conversations', 'detail', conversationId],
        ['conversations', 'list'],
        ['conversations', conversationId, 'messages'],
      ],
    },
  );
}

export function useToggleMute(conversationId: number) {
  return useApiMutation<ApiResponse<{ is_muted: boolean }>, { is_muted: boolean }>(
    {
      path: `/api/conversations/${conversationId}/mute`,
      method: 'PUT',
    },
    {
      invalidate: [
        ['conversations', 'detail', conversationId],
        ['conversations', 'list'],
      ],
    },
  );
}
