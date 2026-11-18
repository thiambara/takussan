/**
 * TCK-2962 — le fil, avec ses cartes et ses événements repliés :
 *
 * · AC4 — trois `event` consécutifs sans geste attendu se replient en une ligne qui se déplie ; un `event`
 *   qui attend le lecteur reste visible, en carte ;
 * · le texte d'un événement d'objet (codes de TCK-2961) se compose depuis le code et les dates de `data`,
 *   jamais depuis `content` ; un code inconnu rend le libellé générique.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function evenement(id: number, code: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id,
    conversation_id: 7,
    sender_id: null,
    sender: null,
    attachments: [],
    type: 'event',
    content: code,
    metadata: { object: { type: 'lease_payment', id: 31 }, code, data },
    object: { id: 31, status: 'late', amount_due: 470000, currency: 'XOF', is_overdue: true, abilities: { pay: false, remind: false, record_payment: false } },
    action_attendue: false,
    created_at: `2026-11-18T08:${String(id).padStart(2, '0')}:00Z`,
    updated_at: `2026-11-18T08:${String(id).padStart(2, '0')}:00Z`,
    ...extra,
  };
}

describe('<ChatView> — cartes et événements repliés (TCK-2962)', () => {
  it('AC4 — trois événements sans geste se replient en une ligne qui se déplie ; celui qui attend le lecteur reste en carte', () => {
    messages = [
      evenement(1, 'lease_payment.due_soon', { due_date: '2026-12-05' }),
      evenement(2, 'lease_payment.reminded', { due_date: '2026-12-05' }),
      evenement(3, 'lease_payment.overdue', { due_date: '2026-12-05', days_late: 3 }),
      evenement(4, 'lease_payment.overdue', { due_date: '2026-12-05', days_late: 4 }, { action_attendue: true }),
    ];
    const { container } = render(withIntl(<ChatView conversationId={7} />));

    const replis = container.querySelectorAll('[data-slot="evenements-replies"]');
    expect(replis).toHaveLength(1);
    const ligne = screen.getByRole('button', { name: /3 événements/ });
    expect(ligne).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Le loyer arrive à échéance le 5 décembre 2026.')).toBeNull();

    // L'événement qui attend le lecteur : une carte, hors de la suite.
    expect(container.querySelectorAll('[data-slot="carte-du-fil"]')).toHaveLength(1);

    fireEvent.click(ligne);
    expect(ligne).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Le loyer arrive à échéance le 5 décembre 2026.')).toBeInTheDocument();
    expect(screen.getByText('Une relance a été faite pour le loyer du 5 décembre 2026.')).toBeInTheDocument();
    expect(screen.getByText('Le loyer du 5 décembre 2026 est en retard de 3 jours.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/lease_payment\./);
  });

  it('un événement seul reste une ligne ; un code inconnu rend le libellé générique, jamais le code', () => {
    messages = [
      evenement(1, 'visit.confirmed', { scheduled_at: '2026-11-21T10:00:00Z' }),
      { ...evenement(2, 'objet.inconnu', {}), type: 'text', sender_id: 9, sender: { id: 9, full_name: 'Fatou' }, content: 'Bonjour', metadata: null },
      evenement(3, 'objet.inconnu', {}),
    ];
    const { container } = render(withIntl(<ChatView conversationId={7} />));

    expect(container.querySelectorAll('[data-slot="evenements-replies"]')).toHaveLength(0);
    expect(screen.getByText(/^Visite confirmée pour le /)).toBeInTheDocument();
    expect(screen.getByText('Le fil a été mis à jour.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/objet\.inconnu/);
  });
});
