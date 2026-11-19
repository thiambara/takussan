/**
 * TCK-2963 — la salle dans le fil : en-tête nommé depuis l'objet, bandeau de la page, chronologie repliée par
 * mois (AC4), saisie remplacée par la raison quand l'API refuse l'écriture (AC3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { Conversation, Message } from '@/types/message';

import { AGENT, message, salleDuBail } from './donnees';

let conversation: Conversation = salleDuBail();
let messages: Message[] = [];

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
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
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: AGENT, roles: ['agent'] }, activeProfileId: null }) }));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));
vi.mock('../../cartes/useCartesEnDirect', () => ({ useCartesEnDirect: vi.fn() }));

const { ChatView } = await import('../../ChatView');

const SALLE = {
  bandeau: <div data-testid="bandeau-de-test" />,
  lectureSeule: <p role="status">Ce bail a pris fin : la salle reste lisible, on n’y écrit plus.</p>,
  onDossier: vi.fn(),
};

function monter() {
  return render(withIntl(<ChatView conversationId={90} salle={SALLE} />));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
  conversation = salleDuBail();
  messages = [];
});
afterEach(() => vi.useRealTimers());

describe('<ChatView> — une salle (TCK-2963)', () => {
  it('se nomme depuis son objet, jamais d’après un membre, et porte le bandeau de la page', () => {
    monter();
    expect(screen.getByRole('heading', { name: 'Bail · F3 Sacré-Cœur 3' })).toBeInTheDocument();
    expect(screen.getByTestId('pastille-de-la-salle')).toBeInTheDocument();
    expect(screen.getByTestId('bandeau-de-test')).toBeInTheDocument();
  });

  it('AC3 — un bail fini : pas de saisie, la raison à sa place', () => {
    conversation = salleDuBail({ abilities: { can_send_message: false } });
    monter();
    expect(screen.queryByPlaceholderText('Écrivez un message…')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Ce bail a pris fin');
  });

  it('AC3 — un bail actif : la saisie', () => {
    conversation = salleDuBail({ abilities: { can_send_message: true } });
    monter();
    expect(screen.getByPlaceholderText('Écrivez un message…')).toBeInTheDocument();
    expect(screen.queryByText(/Ce bail a pris fin/)).toBeNull();
  });

  it('AC4 — les événements d’un mois passé sont repliés, ceux du mois courant ouverts', () => {
    messages = [
      message('event', '2026-09-02T09:00:00Z'),
      message('event', '2026-09-12T09:00:00Z'),
      message('text', '2026-09-13T09:00:00Z', { content: 'Avenant signé, merci.' }),
      message('event', '2026-11-05T09:00:00Z'),
      message('event', '2026-11-06T08:00:00Z'),
      message('event', '2026-11-06T11:20:00Z'),
    ];
    monter();

    expect(screen.getByText('Septembre')).toBeInTheDocument();
    const replis = screen.getAllByRole('button', { name: /événements/ });
    // Septembre (passé) : ses deux événements repliés, fermés. Novembre (courant), jour par jour : le 5 est
    // seul (une ligne), le 6 en a deux — repliés, OUVERTS.
    expect(replis).toHaveLength(2);
    const [septembre, novembre] = replis;
    expect(septembre).toHaveAttribute('aria-expanded', 'false');
    expect(within(septembre!).getByText('2 événements')).toBeInTheDocument();
    expect(novembre).toHaveAttribute('aria-expanded', 'true');
    expect(within(novembre!).getByText('2 événements')).toBeInTheDocument();
    expect(screen.getByText('Avenant signé, merci.')).toBeInTheDocument();
  });

  it('nomme l’auteur d’une bulle, comme dans un groupe', () => {
    messages = [message('text', '2026-11-18T09:40:00Z', { content: 'Bonjour' })];
    monter();
    // TCK-2968 — le nom paraît aussi dans la ligne « Lu par… » du composeur : on le cherche DANS la bulle.
    expect(within(screen.getByText('Bonjour').closest('li')!).getByText(/Ousmane Niang/)).toBeInTheDocument();
  });
});
