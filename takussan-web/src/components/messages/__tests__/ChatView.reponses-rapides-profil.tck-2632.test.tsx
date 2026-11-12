/**
 * TCK-2632 (suivi de vérification, 2026-11-12) — les réponses rapides parlent au nom d'une agence :
 * elles se jugent sur le profil ACTIF quand on le connaît, pas sur les rôles globaux. Un compte agent
 * d'une agence et bailleur ailleurs, actif en bailleur, ne les voit pas ; actif en agent, il les voit.
 * Sans profil connu, les rôles décident, comme avant (`ChatView.composeur.tck-2632.test.tsx`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ChatView } from '../ChatView';

let activeProfileId: string | null = null;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, roles: ['agent', 'owner'] }, token: 't', activeProfileId }),
}));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type: 'direct', participants: [] } } }),
  useMessagesInfinite: () => ({
    data: { pages: [{ data: [] }] },
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
  useConsignerGesteDuClient: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(() => Promise.resolve()) }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

const monter = () => render(withIntl(<ChatView conversationId={7} />));
const reponsesRapides = () => screen.queryByRole('group', { name: 'Réponses rapides' });

beforeEach(() => {
  activeProfileId = null;
});

describe('<ChatView> — les réponses rapides suivent le profil actif', () => {
  it('actif en bailleur : aucune réponse rapide, même avec un rôle d’agent ailleurs', () => {
    activeProfileId = 'owner:5';
    monter();
    expect(reponsesRapides()).not.toBeInTheDocument();
  });

  it('actif en agent : elles sont là', () => {
    activeProfileId = 'agent:9';
    monter();
    expect(reponsesRapides()).toBeInTheDocument();
  });

  it('profil inconnu : les rôles décident, comme avant', () => {
    monter();
    expect(reponsesRapides()).toBeInTheDocument();
  });
});
