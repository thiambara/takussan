'use client';

import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useEffect, useRef } from 'react';
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

/**
 * Reprise du 2026-09-24 — marque LU le fil affiché, à l'ouverture puis à chaque message plus
 * récent qui y arrive tant que l'onglet est visible. `PUT /read` existait côté API et n'était
 * appelé nulle part : `last_read_at` n'avançait que lorsqu'on ÉCRIVAIT, si bien qu'un fil lu sans
 * réponse restait « non lu » pour toujours, et que les accusés de lecture ne voyaient jamais la
 * lecture. La liste est ensuite invalidée : la pastille globale (`useUnreadCount`) suit.
 *
 * Un seul appel par couple (fil, dernier message) ; un échec le laisse rejouable au prochain rendu.
 */
export function useMarkConversationRead(
  conversationId: number | null | undefined,
  newestMessageId: number | null,
  options: { enabled?: boolean } = {},
) {
  const { token } = useAuth();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const dejaMarque = useRef<string | null>(null);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled || !conversationId || newestMessageId == null || !token) return;
    const cle = `${conversationId}:${newestMessageId}`;
    if (dejaMarque.current === cle) return;
    dejaMarque.current = cle;
    apiRequest(`/api/conversations/${conversationId}/read`, { method: 'PUT', token, locale })
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] }))
      .catch(() => {
        if (dejaMarque.current === cle) dejaMarque.current = null;
      });
  }, [conversationId, enabled, locale, newestMessageId, queryClient, token]);
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

// TCK-576 — `useCreateConversation` est retiré : il n'avait aucun appelant, et son corps typé
// (`recipient_id`, `initial_message`) ne correspondait à rien de ce que `POST /api/conversations`
// valide (`participants`, et une seule autre personne joignable depuis TCK-565). Un premier
// contact passe par la fiche publique d'un bien (`PublicPropertyController::contactMessage()`
// choisit lui-même le destinataire), un groupe par `useCreateGroupConversation`.

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
        // La personne ajoutée n'est plus à proposer (TCK-565).
        ['conversations', conversationId, 'contacts'],
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
        // La personne retirée redevient à proposer (TCK-565).
        ['conversations', conversationId, 'contacts'],
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

// =============================================================================
// TCK-565 — choisir les participants et le contexte d'un groupe PAR LEUR NOM
// =============================================================================

/**
 * Une personne joignable, telle que `GET /api/conversations/contacts` la rend
 * (`MessagingContactResource` côté API : le nom et l'avatar, jamais les coordonnées).
 */
export type MessagingContact = {
  id: number;
  name: string;
  avatar_url: string | null;
};

/**
 * Colonnes lues par le sélecteur de participants. `name` est dérivé côté API de ces deux
 * colonnes : sans elles dans le sparse fieldset, il sortirait vide.
 */
export const MESSAGING_CONTACT_FIELDS: string[] = ['id', 'first_name', 'last_name'];

/** Une page du sélecteur. Au-delà, on affine la recherche — la liste le dit. */
export const MESSAGING_CONTACTS_PER_PAGE = 20;

/**
 * Retour testeur du 2026-09-23 (M12) : « Où un utilisateur verrait-il son ID ? » — l'assistant
 * « Nouveau groupe » demandait un identifiant numérique. Ce hook sert le sélecteur par nom qui le
 * remplace.
 *
 * ⚠️ La recherche est SERVEUR (`filter[search]`, Meilisearch côté API) et le périmètre aussi : la
 * liste ne contient que des personnes que le serveur acceptera (`MessagingReach`).
 * Filtrer côté client une liste déjà tronquée redirait le défaut que TCK-363 a soldé ailleurs.
 *
 * `conversationId` — pour COMPLÉTER un groupe existant. La liste vient alors de
 * `/api/conversations/{id}/contacts`, qui lit la règle avec ce groupe, exactement comme l'ajout
 * (`AddParticipantsRequest`) : l'équipe de l'agence de son bien y figure, ses membres actuels non.
 * Lire la liste d'un NOUVEAU groupe à cet endroit proposait des personnes que l'ajout refusait.
 */
export function useMessagingContacts(
  search: string,
  options: { enabled?: boolean; conversationId?: number } = {},
) {
  const { user } = useAuth();
  const terme = search.trim();
  const { conversationId } = options;
  const params: SpatieQueryParams = {
    fields: { users: MESSAGING_CONTACT_FIELDS },
    filter: terme ? { search: terme } : {},
    per_page: MESSAGING_CONTACTS_PER_PAGE,
  };

  return useApiQuery<PaginatedResponse<MessagingContact>>(
    conversationId
      ? ['conversations', conversationId, 'contacts', terme]
      : ['conversations', 'contacts', terme],
    conversationId
      ? `/api/conversations/${conversationId}/contacts`
      : '/api/conversations/contacts',
    {
      params,
      enabled: (options.enabled ?? true) && Boolean(user),
      staleTime: 30_000,
      // Garder la liste précédente pendant la frappe : sans cela, chaque caractère la viderait
      // puis la remplirait, et le popup sauterait.
      placeholderData: (precedent) => precedent,
    },
  );
}

/**
 * TCK-576 — le bien et le bail d'un groupe se CHERCHENT par leur nom.
 *
 * TCK-565 (M11) les avait fait choisir dans deux listes, au lieu de deux identifiants numériques.
 * Ces listes lisaient `/api/properties` et `/api/leases`, plafonnées à 100 et sans recherche :
 * mesuré le 2026-09-24, 106 des 206 biens d'un agent de démo et 46 de ses 146 baux ne pouvaient
 * pas être choisis. Le `filter[search]` de `/api/properties` ne les aurait pas rendus atteignables
 * non plus : il passe par Meilisearch, qui n'indexe que les biens publics et publiés — un
 * brouillon ou un bien privé y est introuvable (« Espace de bureau à Mbour », id 145, mesuré).
 *
 * D'où deux routes de la messagerie, `/api/conversations/context/{properties,leases}` : recherche
 * SQL sur le titre et la référence, périmètre = ce que la création d'un groupe accepte (les
 * policies `view`), liste blanche étroite. Côté écran, `GroupContextPicker`.
 */
export const GROUP_CONTEXT_PROPERTY_FIELDS: string[] = ['id', 'title', 'reference_number'];
export const GROUP_CONTEXT_LEASE_FIELDS: string[] = ['id', 'reference_number', 'property_id'];
/** Une page du sélecteur, comme celui des participants. Au-delà, on affine la recherche. */
export const GROUP_CONTEXT_PER_PAGE = 20;

export type GroupContextProperty = { id: number; title: string; reference_number: string | null };
export type GroupContextLease = {
  id: number;
  reference_number: string;
  property_id: number;
  property?: GroupContextProperty | null;
};

export function useGroupPropertyOptions(search: string, options: { enabled?: boolean } = {}) {
  const terme = search.trim();
  return useApiQuery<PaginatedResponse<GroupContextProperty>>(
    ['conversations', 'group-context', 'properties', terme],
    '/api/conversations/context/properties',
    {
      params: {
        fields: { properties: GROUP_CONTEXT_PROPERTY_FIELDS },
        filter: terme ? { search: terme } : {},
        per_page: GROUP_CONTEXT_PER_PAGE,
      },
      enabled: options.enabled ?? true,
      staleTime: 60_000,
      // Même raison que `useMessagingContacts` : garder la liste pendant la frappe.
      placeholderData: (precedent) => precedent,
    },
  );
}

/**
 * Les baux, restreints au bien choisi s'il y en a un. La clé porte le bien en position 3 — lue par
 * `placeholderData` ci-dessous : ne pas la réordonner sans elle.
 */
export function useGroupLeaseOptions(
  propertyId: number | null,
  search: string,
  options: { enabled?: boolean } = {},
) {
  const terme = search.trim();
  const filter: Record<string, string | number> = {};
  if (propertyId) filter.property_id = propertyId;
  if (terme) filter.search = terme;
  return useApiQuery<PaginatedResponse<GroupContextLease>>(
    ['conversations', 'group-context', 'leases', propertyId, terme],
    '/api/conversations/context/leases',
    {
      params: {
        fields: { leases: GROUP_CONTEXT_LEASE_FIELDS, properties: GROUP_CONTEXT_PROPERTY_FIELDS },
        filter,
        include: ['property'],
        per_page: GROUP_CONTEXT_PER_PAGE,
      },
      enabled: options.enabled ?? true,
      staleTime: 60_000,
      // ⚠ La liste précédente ne se garde que pour le MÊME bien (réparation 1, 2026-09-24). Gardée
      // sans condition, elle montrait — cliquables — les baux de tous les biens, ou d'un autre
      // bien, tant que la requête du bien choisi était en vol : mesuré à 2,5 s de latence, le
      // groupe partait avec la villa d'Almadies et un bail de Mbour. Pendant la frappe (même bien,
      // autre terme), la garder évite que le popup saute ; au changement de bien, l'écran dit
      // « Recherche… » plutôt que de proposer ce qu'il ne faut pas.
      placeholderData: (precedent, requetePrecedente) =>
        requetePrecedente?.queryKey[3] === propertyId ? precedent : undefined,
    },
  );
}
