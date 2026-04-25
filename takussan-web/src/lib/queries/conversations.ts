'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { Conversation, Message, MessageAttachment } from '@/types/message';

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

const MESSAGE_LIST_FIELDS: string[] = [
  'id',
  'conversation_id',
  'sender_id',
  'content',
  'type',
  'created_at',
];

export type UseConversationsParams = {
  status?: 'active' | 'archived' | 'closed';
  property_id?: number;
  page?: number;
  per_page?: number;
};

export function useConversations(
  params: UseConversationsParams = {},
  options: { refetchInterval?: number | false } = {},
) {
  const filter: Record<string, string | number> = {};
  if (params.status) filter.status = params.status;
  if (params.property_id) filter.property_id = params.property_id;

  const spatieParams: SpatieQueryParams = {
    fields: {
      conversations: CONVERSATION_LIST_FIELDS,
      properties: ['id', 'title', 'slug', 'main_photo_url'],
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
      properties: ['id', 'title', 'slug', 'main_photo_url'],
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

export function useMessages(
  conversationId: number | null | undefined,
  options: { refetchInterval?: number | false } = {},
) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      messages: MESSAGE_LIST_FIELDS,
    },
    include: ['sender', 'attachments'],
    sort: ['created_at'],
    per_page: 200,
  };

  return useApiQuery<PaginatedResponse<Message>>(
    ['conversations', conversationId, 'messages'],
    `/api/conversations/${conversationId ?? ''}/messages`,
    {
      params: spatieParams,
      enabled: Boolean(conversationId),
      // 3 s polling when the conversation is open. Callers can pass
      // `refetchInterval: false` to pause when the tab is hidden.
      refetchInterval: options.refetchInterval ?? 3_000,
      staleTime: 0,
    },
  );
}

export type SendMessagePayload = {
  content: string;
};

export function useSendMessage(conversationId: number) {
  return useApiMutation<ApiResponse<Message>, SendMessagePayload>(
    {
      path: `/api/conversations/${conversationId}/messages`,
      method: 'POST',
    },
    {
      invalidate: [
        ['conversations', conversationId, 'messages'],
        ['conversations', 'list'],
        ['conversations', 'detail', conversationId],
      ],
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
  participant_ids: number[];
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
