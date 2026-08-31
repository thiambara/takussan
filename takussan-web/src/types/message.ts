/**
 * Conversation + Message types.
 * Aligned with `docs/models-spec.md#18-conversation-`, `#19-conversationparticipant-`, `#20-message-`.
 */

export type ConversationType = 'direct' | 'group' | 'support';

export type ConversationStatus = 'active' | 'archived' | 'closed';

export type MessageType = 'text' | 'image' | 'document' | 'system';

export type ConversationParticipant = {
  id: number;
  user_id: number;
  role: 'member' | 'admin';
  is_muted?: boolean;
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
  old_role?: 'member' | 'admin';
  new_role?: 'member' | 'admin';
  old_subject?: string;
  new_subject?: string;
};

export type MessageAttachment = {
  id: number;
  name: string;
  url: string;
  mime_type: string | null;
  size: number | null;
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
  sender?: {
    id: number;
    full_name: string;
    avatar_url: string | null;
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
  last_message?: Message;
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
