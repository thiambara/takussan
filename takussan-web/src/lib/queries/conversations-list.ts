'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import type { PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { Conversation } from '@/types/message';

/**
 * TCK-1042 (P70.07) — séparé de `conversations.ts`, qui le réexporte : la pastille de la
 * messagerie (`useUnreadCount`) est montée par la coque de `/app`, et importer `conversations.ts`
 * y faisait entrer ses 37 exports, que le bundler n'élague pas (mesuré sur le JS de
 * `/app/overview`).
 */

export const CONVERSATION_LIST_FIELDS: string[] = [
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
