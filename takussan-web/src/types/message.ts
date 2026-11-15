/**
 * Conversation + Message types.
 * Aligned with `docs/models-spec.md#18-conversation-`, `#19-conversationparticipant-`, `#20-message-`.
 */

export type ConversationType = 'direct' | 'group' | 'support';

export type ConversationStatus = 'active' | 'archived' | 'closed';

/** TCK-592 (ADR-0038) — `audio` : une note vocale, son fichier dans `attachments`. */
export type MessageType = 'text' | 'image' | 'document' | 'system' | 'audio';

export type ConversationParticipant = {
  id: number;
  user_id: number;
  role: 'member' | 'admin';
  is_muted?: boolean;
  /**
   * TCK-2632 — rendu pour le SEUL lecteur, comme `is_muted` (clé absente pour les autres) : le fil
   * qu'il a archivé. Envoyer un message le désarchive (`sendMessage`).
   */
  archived_at?: string | null;
  last_read_at: string | null;
  joined_at: string;
  left_at: string | null;
  user?: {
    id: number;
    full_name: string;
    avatar_url: string | null;
    email?: string;
  };
};

export type SystemMessageEvent =
  | 'participant_added'
  | 'participant_removed'
  | 'role_changed'
  | 'renamed'
  /** TCK-592 — une étape de l'intervention que porte le fil. */
  | 'maintenance';

export type MessageMetadata = {
  event?: SystemMessageEvent;
  actor_id?: number;
  actor_name?: string;
  target_id?: number;
  target_name?: string;
  /** `event: 'role_changed'` — le nouveau rôle (`SystemMessageFactory::roleChanged()`). */
  role?: 'member' | 'admin';
  old_subject?: string;
  new_subject?: string;
  /** TCK-592 — `event: 'maintenance'` : la cause et le statut, en CODES rendus par le front. */
  maintenance_request_id?: number;
  cause?: string;
  from?: string | null;
  status?: string;
  provider_name?: string | null;
  /** TCK-592 (ADR-0038) — durée DÉCLARÉE d'une note vocale, en secondes : affichage seulement. */
  duration?: number;
};

export type MessageAttachment = {
  id: number;
  name: string;
  url: string;
  mime_type: string | null;
  size: number | null;
  /**
   * TCK-2631 — la vignette signée (400 px). `null` pour un PDF, une note vocale, ou tant que la file
   * `media` ne l'a pas produite : retomber alors sur `url`.
   */
  thumbnail_url?: string | null;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  content: string;
  type: MessageType;
  attachments: MessageAttachment[];
  metadata?: MessageMetadata | null;
  created_at: string;
  updated_at: string;
  // TCK-2013 (P175.04) — rendu par `MessageResource` ; nul pour un compte effacé.
  sender?: {
    id: number;
    full_name: string;
  } | null;
};

export type Conversation = {
  id: number;
  subject: string | null;
  property_id: number | null;
  lease_id: number | null;
  maintenance_request_id: number | null;
  type: ConversationType;
  status: ConversationStatus;
  created_by: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  participants?: ConversationParticipant[];
  property?: {
    id: number;
    title: string;
    slug: string;
    main_photo_url: string | null;
  };
  /**
   * TCK-671 — rendu par la liste (`ConversationController::index`) : le type du dernier message, et la
   * `metadata` d'un avis système seulement (`null` sinon), d'où le front dérive l'aperçu.
   */
  last_message?: Pick<Message, 'id' | 'type' | 'metadata'> | null;
  /**
   * TCK-2374 (P248.01) — rendu par `GET /api/conversations/{id}` seulement. `can_send_message` est
   * faux pour le demandeur dont le bail a pris fin, dans le fil de son intervention : il le lit sans
   * y écrire.
   */
  abilities?: {
    can_send_message: boolean;
  };
};

/**
 * TCK-500 — la réponse de `GET /api/public/properties/{slug}/conversation`.
 *
 * Une seule question posée à l'API au clic sur « Envoyer un message » : est-ce que ce bien a
 * déjà un fil, et ai-je le droit d'écrire dessus ? `conversation_id === null` avec
 * `can_message === true` est le cas qui déclenche le brouillon — le fil n'existe pas encore et
 * il ne sera créé qu'à l'envoi.
 */
export type PropertyConversationResolution = {
  conversation_id: number | null;
  can_message: boolean;
  property: {
    id: number;
    slug: string;
    title: string;
    reference_number: string;
    main_photo_url: string | null;
  };
  recipient: {
    id: number;
    name: string;
    avatar_url: string | null;
  } | null;
};

/**
 * TCK-2630 — `GET /api/conversations/{id}/context` : la colonne de contexte d'un fil. Chaque bloc vaut
 * `null` s'il n'existe pas ou n'est pas lisible par l'appelant.
 *
 * `customer` est ABSENT (clé omise) pour qui n'est pas du personnel de l'agence du fil : un client,
 * un bailleur ou un prestataire ne voit jamais qu'une fiche existe. Pour le personnel, `null` sans
 * fiche ; `stage`, `phone` et `assigned_agent` valent `null` ensemble sans droit de lecture.
 */
export type ConversationContext = {
  property: {
    id: number;
    slug: string;
    title: string;
    reference_number: string | null;
    price: number | null;
    status: string | null;
    cover_url: string | null;
  } | null;
  lease: {
    id: number;
    status: string | null;
    reference: string | null;
    tenant_name: string | null;
  } | null;
  maintenance: {
    id: number;
    status: string | null;
    title: string | null;
    scheduled_at: string | null;
  } | null;
  customer?: {
    id: number;
    full_name: string | null;
    stage: string | null;
    phone: string | null;
    assigned_agent: { id: number; name: string } | null;
  } | null;
  /**
   * TCK-2748 — la relation de chaque participant ACTUEL au contexte du fil, dérivée par l'API du bail,
   * de l'intervention et du bien, et jugée sur ce que l'appelant peut lire : un participant absent de
   * la liste n'a pas de relation lisible (jamais devinée côté front). `category` : celle de
   * l'intervention, pour le prestataire seul. Facultatif : une réponse d'avant TCK-2748 n'en porte pas.
   */
  participants?: ReadonlyArray<RelationAuFil>;
};

export type CodeDeRelationAuFil = 'prestataire' | 'locataire' | 'proprietaire' | 'agent';

export type RelationAuFil = {
  user_id: number;
  relation: CodeDeRelationAuFil;
  category?: string | null;
};
