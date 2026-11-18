/**
 * TCK-2958 (ADR-0128, AC8) — dans le fil, un `event` s'affiche comme une ligne d'avis composée depuis
 * son code (dans la langue du lecteur), et une `card` comme une ligne neutre ; ni l'un ni l'autre ne
 * montre son `content` (un code) ni ne tombe dans la bulle d'un message écrit.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ChatView } from '../ChatView';

let messages: unknown[] = [];

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles: ['agent'] }, token: 't' }) }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type: 'group', participants: [] } } }),
  useMessagesInfinite: () => ({
    data: { pages: [{ data: messages }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
  useNewMessagesPolling: vi.fn(),
  useMarkConversationRead: vi.fn(),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConversationContext: () => ({ data: undefined }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

const base = (id: number, extra: Record<string, unknown>) => ({
  id,
  conversation_id: 7,
  attachments: [],
  created_at: `2026-11-18T08:${String(id).padStart(2, '0')}:00Z`,
  updated_at: `2026-11-18T08:${String(id).padStart(2, '0')}:00Z`,
  ...extra,
});

describe('<ChatView> — cartes et événements (TCK-2958)', () => {
  it('rend un événement d’intervention comme un avis, et une carte comme une ligne neutre', () => {
    messages = [
      base(1, {
        sender_id: null,
        sender: null,
        type: 'event',
        content: 'maintenance.accepted',
        metadata: { object: { type: 'maintenance_request', id: 4 }, code: 'maintenance.accepted', data: { status: 'open', provider_name: 'Awa' } },
        object: { id: 4, title: 'Fuite', abilities: {} },
      }),
      base(2, {
        sender_id: 9,
        sender: { id: 9, full_name: 'Fatou Wade' },
        type: 'card',
        content: 'lease.shared',
        metadata: { object: { type: 'lease', id: 3 }, code: 'lease.shared', data: {} },
        object: { indisponible: true },
      }),
    ];
    render(withIntl(<ChatView conversationId={7} />));

    expect(screen.getByText("Awa a accepté l'intervention.")).toBeInTheDocument();
    expect(screen.getByText('Un objet a été partagé.')).toBeInTheDocument();
    expect(screen.queryByText('maintenance.accepted')).toBeNull();
    expect(screen.queryByText('lease.shared')).toBeNull();
  });
});
