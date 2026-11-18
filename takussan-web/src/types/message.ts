/**
 * Conversation + Message types.
 * Aligned with `docs/models-spec.md#18-conversation-`, `#19-conversationparticipant-`, `#20-message-`.
 */

// TCK-2963 (ADR-0128 § 2) — `lease` et `booking` : les SALLES d'un bail et d'une réservation (TCK-2960), un fil
// unique par objet, nommé par le front depuis l'objet (`subject` y reste nul).
export type ConversationType = 'direct' | 'group' | 'support' | 'lease' | 'booking';

export type ConversationStatus = 'active' | 'archived' | 'closed';

/**
 * TCK-592 (ADR-0038) — `audio` : une note vocale, son fichier dans `attachments`.
 * TCK-2958 (ADR-0128) — `event` : un avis sur un objet (sans auteur), rendu comme un avis système ;
 * `card` : une carte qui désigne un objet (rendu riche : TCK-2962). Leur `content` est un CODE.
 */
export type MessageType = 'text' | 'image' | 'document' | 'system' | 'audio' | 'card' | 'event';

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
  | 'renamed';

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
  /**
   * TCK-2958 (ADR-0128) — `card` et `event` : l'objet désigné, le code (`maintenance.<cause>`…) et
   * des données que TOUT participant peut lire (jamais un montant ni une coordonnée). Les avis
   * d'intervention (`event: 'maintenance'` jusqu'ici) sont des `event` : leur cause est dans le code.
   */
  object?: { type: string; id: number | null };
  code?: string;
  data?: Record<string, string | number | boolean | null>;
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
    /**
     * TCK-2858 — dans un GROUPE, le rôle de l'auteur au fil, jugé pour l'appelant (un code, le
     * libellé est au front : `messaging.chat.role.*`, TCK-2860). `null` dans un fil direct ou sans
     * relation lisible ; absent d'une réponse d'avant TCK-2858.
     */
    role_label_code?: RoleDeLAuteur | null;
  } | null;
  /**
   * TCK-2858 — fil direct, message de l'appelant : l'autre l'a-t-il lu (`last_read_at` ≥ `created_at`) ?
   * `null` ailleurs (message d'un autre, groupe). Le relevé `after_id` ne le rafraîchit pas.
   */
  read_by_recipient?: boolean | null;
  /** TCK-2858 — groupe, message de l'appelant : combien des autres membres actuels l'ont lu. `null` ailleurs. */
  read_count?: number | null;
  /**
   * TCK-2958 (ADR-0128 § 3) — `card` et `event` : l'objet RELU pour l'appelant (sa projection et ses
   * `abilities`), ou `{ indisponible: true }` s'il ne le lit pas ou s'il n'existe plus.
   */
  object?: ObjetDuMessage;
  /**
   * TCK-2959 — un `event` seulement : un geste de l'appelant est-il attendu (`action_for`) ? Absent ailleurs.
   * TCK-2962 — vrai, l'événement se rend en carte (avec ses gestes) au lieu d'une ligne repliable. Il ne dit
   * jamais que le geste est fait : c'est `object` qui le dit.
   */
  action_attendue?: boolean;
};

/** TCK-2958 — l'objet d'une carte ou d'un événement, tel que l'appelant le lit. */
export type ObjetDuMessage =
  | { indisponible: true }
  | ({ id: number; abilities?: Record<string, boolean> } & Record<string, unknown>);

/**
 * TCK-2962 — les projections que `SujetsDuFil` déclare (API, TCK-2958), par type d'objet. Toute clé est
 * FACULTATIVE : la ressource de l'objet n'en rend à un lecteur que ce qu'il lit (le demandeur d'une
 * intervention ne reçoit ni `quote_amount` ni coût). L'écran ne lit un droit que dans `abilities`.
 */
export type TypeDObjetDuFil = 'maintenance_request' | 'lease' | 'booking' | 'lease_payment' | 'inventory' | 'property_visit';

type Partie = { readonly id: number; readonly name?: string | null; readonly full_name?: string | null } | null;

export type ProjectionIntervention = {
  readonly id: number;
  readonly title?: string | null;
  readonly status?: string | null;
  readonly category?: string | null;
  readonly scheduled_at?: string | null;
  readonly completed_at?: string | null;
  readonly requester_id?: number | null;
  readonly quote_amount?: number | null;
  readonly quote_currency?: string | null;
  readonly property?: { readonly id: number; readonly title?: string | null } | null;
  readonly assignee?: Partie;
  readonly abilities?: {
    readonly can_decide_quote?: boolean;
    readonly can_view_quote_pdf?: boolean;
    readonly can_request_reschedule?: boolean;
    readonly [geste: string]: unknown;
  };
};

export type ProjectionEcheance = {
  readonly id: number;
  readonly lease_id?: number | null;
  readonly payment_type?: string | null;
  readonly status?: string | null;
  readonly period_start?: string | null;
  readonly due_date?: string | null;
  readonly paid_at?: string | null;
  readonly amount?: number | null;
  readonly amount_due?: number | null;
  readonly currency?: string | null;
  readonly is_overdue?: boolean | null;
  readonly abilities?: { readonly pay?: boolean; readonly remind?: boolean; readonly record_payment?: boolean };
};

export type ProjectionEtatDesLieux = {
  readonly id: number;
  readonly type?: string | null;
  readonly status?: string | null;
  readonly lease_id?: number | null;
  readonly conducted_at?: string | null;
  readonly tenant_signed?: boolean | null;
  readonly owner_signed?: boolean | null;
  readonly signed_at?: string | null;
  readonly can_sign_as?: readonly string[] | null;
};

export type ProjectionReservation = {
  readonly id: number;
  readonly reference_number?: string | null;
  readonly kind?: string | null;
  readonly status?: string | null;
  readonly start_date?: string | null;
  readonly end_date?: string | null;
  readonly property?: { readonly id: number; readonly title?: string | null } | null;
  readonly customer?: { readonly id: number; readonly first_name?: string | null; readonly last_name?: string | null } | null;
  readonly abilities?: { readonly confirm?: boolean; readonly reject?: boolean; readonly cancel?: boolean };
};

export type ProjectionVisite = {
  readonly id: number;
  readonly type?: string | null;
  readonly status?: string | null;
  readonly scheduled_at?: string | null;
  readonly preferred_window?: string | null;
  readonly property?: { readonly id: number; readonly title?: string | null } | null;
  readonly abilities?: { readonly confirm?: boolean; readonly [geste: string]: unknown };
};

export type ProjectionBail = {
  readonly id: number;
  readonly reference_number?: string | null;
  readonly status?: string | null;
  readonly start_date?: string | null;
  readonly end_date?: string | null;
  readonly monthly_rent?: number | null;
  readonly currency?: string | null;
  readonly property?: { readonly id: number; readonly title?: string | null } | null;
};

/** TCK-2858 — `sender.role_label_code` (`FaitsDesMessages::ROLES` + `agency_admin`, `customer`). */
export type RoleDeLAuteur = 'tenant' | 'owner' | 'service_provider' | 'agent' | 'agency_admin' | 'customer';

export type Conversation = {
  id: number;
  subject: string | null;
  property_id: number | null;
  lease_id: number | null;
  maintenance_request_id: number | null;
  /**
   * TCK-2963 — l'objet auquel le fil appartient (TCK-2957, clé du registre `SujetsDuFil`) : `lease:<id>` ou
   * `booking:<id>` pour une salle. Nuls sans sujet ; absents d'une réponse d'avant.
   */
  subject_type?: string | null;
  subject_id?: number | null;
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
   * TCK-2958 — et d'un `event` ou d'une `card` : `last_message_preview` n'est plus que leur code.
   */
  last_message?: (Pick<Message, 'id' | 'type' | 'metadata'> & {
    /**
     * TCK-2858 — l'auteur du dernier message (`null` pour un avis système) : l'accueil du client
     * (TCK-2853) ne dit « X vous a répondu » que si ce n'est pas le sien. Absent d'une réponse d'avant.
     */
    sender_id?: number | null;
  }) | null;
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
    /**
     * TCK-2858 — le besoin saisi sur la fiche (`null` sans aucun critère, ou sans droit de lecture).
     * Budgets en nombre, comme `property.price`.
     */
    project?: {
      contract_type: 'sale' | 'rent' | null;
      property_types: string[];
      budget_min: number | null;
      budget_max: number | null;
      cities: string[];
      neighborhoods: string[];
    } | null;
    /** TCK-2858 — la plus récente visite passée (ni annulée ni manquée) sur un bien de l'agence du fil. */
    last_visit?: { id: number; scheduled_at: string | null; property_title: string | null } | null;
    /**
     * TCK-2858 — le premier contact : le plus ancien de la fiche et de sa première demande. `null`
     * SANS droit de lecture de la fiche (jamais sinon : la fiche a toujours une date).
     */
    first_contact_at?: string | null;
    /** TCK-2858 — le canal de la première demande, quand c'est elle le premier contact. */
    origin?: 'form' | 'whatsapp' | 'call' | null;
    /** TCK-2858 — la demande de contact liée au fil (`null` sans `PropertyContactLeadPolicy::view`). */
    contact_lead?: { id: number; created_at: string | null; property_title: string | null } | null;
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
