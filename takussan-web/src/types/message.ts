export type Conversation = {
  id: number;
  subject: string | null;
  last_message_at: string | null;
  unread_count: number;
  participants: { id: number; full_name: string; avatar_url: string | null }[];
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  attachments: { name: string; url: string }[];
  read_at: string | null;
  created_at: string;
};
