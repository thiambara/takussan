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
  | 'renamed'
  // TCK-2984 (ADR-0132 § 3) — les avis du pont (`SystemMessageFactory::AVIS_DU_PONT`), personnel seul.
  | 'pont.stop'
  | 'pont.start'
  | 'pont.accord'
  | 'pont.media_non_relaye'
  | 'pont.numero_deja_a_un_compte';

export type MessageMetadata = {
  event?: SystemMessageEvent;
  /** TCK-2984 — un avis du pont : le canal (chaîne libre du pilote), le compte visé ; jamais un numéro. */
  channel?: string;
  user_id?: number;
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
  /**
   * TCK-2966 (ADR-0128 § 6) — les comptes mentionnés (`@Prénom Nom` dans `content`, écrit par le front) :
   * des identifiants, que l'écran nomme d'après les participants — jamais affichés tels quels (TCK-2968).
   */
  mentions?: number[];
};

/**
 * TCK-2965 (ADR-0128 § 6) — `team` : une note d'équipe, que seul le personnel de l'agence du fil lit.
 * Absent d'une réponse d'avant : vaut `all` (TCK-2968).
 */
export type MessageVisibility = 'all' | 'team';

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
  /** TCK-2965 — la destination du message ; absente (réponse d'avant), `all`. */
  visibility?: MessageVisibility;
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
  /**
   * TCK-2977 (ADR-0131 § 7, TCK-2976) — la transcription d'une note `audio`, rendue au SEUL personnel servi par
   * le copilote ; clé absente pour tout autre lecteur.
   */
  transcription?: TranscriptionDeLaNote;
  // TCK-2984 (ADR-0132 § 0, § 4, § 5) — le pont : clés ABSENTES pour qui n'est pas personnel de l'agence du fil
  // (`channel` : aussi l'auteur). Le front ne les déduit d'aucun autre champ.
  channel?: string;
  relays?: ReadonlyArray<RelaisDuMessage>;
  action_link?: TraceDuLienDAction;
};

/** TCK-2984 — un relais du message vers un participant (TCK-2981), sans numéro. */
export type RelaisDuMessage = {
  user_id: number;
  channel: string;
  /** `texte`, `gabarit`… (un code). */
  form?: string | null;
  /** `sent`, `delivered`, `read`, `failed`, `sms_fallback`… (un code ; inconnu : rendu générique). */
  status?: string | null;
  at?: string | null;
};

/** TCK-2984 — la trace du lien d'action d'une carte ou d'un événement (TCK-2982). */
export type TraceDuLienDAction = {
  sent_at?: string | null;
  opened_at?: string | null;
  used_at?: string | null;
  expires_at?: string | null;
};

/**
 * TCK-2984 — l'état du pont d'un participant : une ligne de `context.pont` (TCK-2981), indexée par `user_id`, pour
 * chaque participant actif sauf le lecteur. Personnel seul ; aucun numéro.
 */
/** TCK-2984 — `context.pont_fiche` (TCK-2981). */
export type PontDeLaFiche = {
  customer_id: number;
  full_name: string;
  invitable: boolean;
  invitation_en_attente: boolean;
  opposition_at: string | null;
};

export type PontDuParticipant = {
  joint: boolean;
  invitation_en_attente?: boolean;
  /** Le dernier canal de relais dans ce fil (chaîne libre du pilote) ; nul : aucun relais encore. */
  canal?: string | null;
  accord_at?: string | null;
  opposition_at?: string | null;
  /** Fin de la fenêtre de texte libre ; nul : fermée. */
  fenetre_jusqu_a?: string | null;
  invitable: boolean;
};

/** TCK-2958 — l'objet d'une carte ou d'un événement, tel que l'appelant le lit. */
/** TCK-2977 — `{etat, texte?, langue?, code?}` de `MessageResource.transcription` (TCK-2976). */
export type TranscriptionDeLaNote = {
  etat: 'aucune' | 'en_cours' | 'prete' | 'indisponible';
  texte?: string | null;
  langue?: string | null;
  code?: string | null;
};

/**
 * TCK-2977 (TCK-2974) — `false` pour qui n'a pas droit au copilote ; pour le personnel autorisé, l'état de chaque
 * fonction, même toutes coupées : `raison` dit pourquoi une fonction ne sert pas (`plateforme`, `agence`,
 * `non_configuree`). `true` est accepté (forme d'avant).
 */
export type CopiloteDuFil =
  | boolean
  | { fonctions?: Record<string, { active: boolean; raison: 'plateforme' | 'agence' | 'non_configuree' | null } | undefined> };

export type ObjetDuMessage =
  | { indisponible: true }
  | ({ id: number; abilities?: Record<string, boolean> } & Record<string, unknown>);

/**
 * TCK-2962 — les projections que `SujetsDuFil` déclare (API, TCK-2958), par type d'objet. Toute clé est
 * FACULTATIVE : la ressource de l'objet n'en rend à un lecteur que ce qu'il lit (le demandeur d'une
 * intervention ne reçoit ni `quote_amount` ni coût). L'écran ne lit un droit que dans `abilities`.
 */
export type TypeDObjetDuFil = 'maintenance_request' | 'lease' | 'booking' | 'lease_payment' | 'inventory' | 'property_visit' | 'property';

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

/**
 * TCK-2967 (ADR-0128 § 7) — la file d'un fil POUR LE LECTEUR, dérivée par l'API (`FileDuFil`) : `vous` (un
 * geste vous est demandé), `attente` (la balle est dans l'autre camp), `rappel` (mis de côté), `ajour`.
 */
// TCK-2973 (ADR-0130 § 5) — `retard` : une promesse due au lecteur n'a pas été tenue (TCK-2971).
export type FileDuFil = 'vous' | 'retard' | 'attente' | 'rappel' | 'ajour';

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
  /**
   * TCK-2967 — la boîte de pilotage, rendue par la seule liste. `attend_depuis` ne vaut que pour `vous` ;
   * `en_attente_de` (identifiants des participants actifs attendus) que pour `attente`. `snoozed_until` et
   * `handled_at` sont les gestes du lecteur (« Rappelez-le-moi », « Traité »).
   */
  file?: FileDuFil;
  attend_depuis?: string | null;
  en_attente_de?: number[];
  snoozed_until?: string | null;
  handled_at?: string | null;
  /**
   * TCK-2973 (TCK-2971) — l'engagement que la rangée signale (le plus en retard, sinon le prochain), et
   * depuis quand le fil est en retard. `holder_id` se nomme d'après les participants, jamais à l'écran.
   */
  retard_depuis?: string | null;
  engagement?: { id: number; title: string | null; holder_id: number; due_at: string | null; etat: 'proposed' | 'open' | 'late' | 'kept' | 'cancelled' } | null;
  /** TCK-2967 — la personne de l'agence qui suit le fil (salle ou groupe) : son nom, jamais ses coordonnées. */
  assigned_to?: { id: number; name: string } | null;
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
  };  /**
   * TCK-2977 (ADR-0131 § 1, TCK-2974) — le lecteur a-t-il le copilote dans ce fil ? Faux ou absent : le front
   * n'émet AUCUNE requête `…/copilote` ni `…/transcription`, et n'affiche rien de l'assistant.
   */
  copilote?: CopiloteDuFil;
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
  /** TCK-2967 / TCK-2968 — l'appelant peut-il écrire une note d'équipe dans ce fil (la règle du 422 de TCK-2965) ? */
  can_write_team_note?: boolean;
  /**
   * TCK-2967 / TCK-2968 — tout participant actif qui lit les notes de ce fil, AVEC ou SANS ligne de relation
   * (trié ; vide pour un appelant qui ne les lit pas). La source des mentionnables d'une note.
   */
  team_note_reader_ids?: ReadonlyArray<number>;
  /**
   * TCK-2973 (TCK-2987, ADR-0130 § 6) — la fiabilité de chaque participant, par compte : deux entiers sur
   * 90 jours. Clé ABSENTE pour qui n'est pas du personnel actif de l'agence : le front ne la déduit jamais.
   */
  commitments_records?: Readonly<Record<string, { readonly kept: number; readonly late: number }>>;
  /** TCK-2984 (TCK-2981) — l'état du pont de chaque participant actif sauf le lecteur, par `user_id` ; personnel seul. */
  pont?: Readonly<Record<string, PontDuParticipant>>;
  /**
   * TCK-2984 (TCK-2981 AC6) — la fiche du locataire SANS COMPTE du bail de la salle, à joindre par le pont ; `null` sans
   * bail ou quand le locataire a un compte (il est alors dans `pont`). Personnel seul ; aucun numéro.
   */
  pont_fiche?: PontDeLaFiche | null;
};

export type CodeDeRelationAuFil = 'prestataire' | 'locataire' | 'proprietaire' | 'agent';

export type RelationAuFil = {
  user_id: number;
  relation: CodeDeRelationAuFil;
  category?: string | null;
  /**
   * TCK-2967 / TCK-2968 — ce participant lit-il les notes d'équipe de ce fil ? Faux partout pour un appelant
   * qui ne les lit pas lui-même ; une ligne absente vaut faux.
   */
  reads_team_notes?: boolean;
};
