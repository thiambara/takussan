/**
 * TCK-2374 (P248.01) — le demandeur dont le bail a pris fin lit le fil de son intervention sans y
 * écrire : `GET /api/conversations/{id}` rend `abilities.can_send_message: false`, et l'API refuse
 * l'envoi (403). La saisie laisse alors place à une note. Absent, le drapeau ne cache rien.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { ChatView } from '../ChatView';

let conversation: Partial<Conversation> = {};

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
  useMessagesInfinite: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useNewMessagesPolling: vi.fn(),
  useMarkConversationRead: vi.fn(),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

function monter() {
  return render(withIntl(<ChatView conversationId={7} />));
}

describe('<ChatView> — fil en lecture seule (TCK-2374)', () => {
  beforeEach(() => {
    conversation = { id: 7, type: 'group', participants: [], maintenance_request_id: 3 };
  });

  it("cache la saisie quand l'API refuserait l'envoi", () => {
    conversation.abilities = { can_send_message: false };
    monter();

    expect(screen.queryByPlaceholderText('Écrivez un message…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ce fil est en lecture seule : votre bail pour ce logement a pris fin.',
    );
  });

  it('garde la saisie quand le drapeau est vrai', () => {
    conversation.abilities = { can_send_message: true };
    monter();

    expect(screen.getByPlaceholderText('Écrivez un message…')).toBeInTheDocument();
  });

  it('garde la saisie quand le drapeau est absent', () => {
    monter();

    expect(screen.getByPlaceholderText('Écrivez un message…')).toBeInTheDocument();
  });
});
