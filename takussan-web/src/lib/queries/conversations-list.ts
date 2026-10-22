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

/**
 * TCK-1387 (P135.02) — `meta.unread_total` : les non-lus de TOUTE la liste du lecteur, hors fils en
 * sourdine, comptés par l'API. La pastille le lit au lieu d'additionner les `unread_count` de la
 * page, qui ignoraient les fils au-delà des 30 premiers.
 */
export type ConversationListPage = PaginatedResponse<Conversation> & {
  meta: PaginatedResponse<Conversation>['meta'] & { unread_total?: number };
};

/** Les paramètres d'une page de la liste, partagés par la pastille et le défilement infini. */
export function conversationListParams(page: number, perPage: number): SpatieQueryParams {
  return {
    // P100.05 (TCK-1186) — `fields` inerte : `ConversationController::index` ne passe pas par `buildQuery`
    // (`Conversation::$queryFields` vide) ; il ne réduit pas la charge. Gardé pour déclarer ce que lit l'écran.
    fields: {
      conversations: CONVERSATION_LIST_FIELDS,
      properties: CONVERSATION_PROPERTY_FIELDS,
    },
    include: ['property', 'participants', 'last_message'],
    sort: ['-last_message_at'],
    page,
    per_page: perPage,
  };
}

// P150.05 (TCK-1286) — ni `status` ni `property_id` : `ConversationController::index` ne lit aucun
// `filter[…]` (il lit `?archived=`) ; un filtre « archivées » aurait rendu les actives sans le dire.
export type UseConversationsParams = {
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

  const spatieParams = conversationListParams(params.page ?? 1, params.per_page ?? 30);

  return useApiQuery<ConversationListPage>(
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
