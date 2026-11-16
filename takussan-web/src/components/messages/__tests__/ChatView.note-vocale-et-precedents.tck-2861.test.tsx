/**
 * TCK-2861 — le fil de la messagerie (maquette `app-messagerie`, e1 et e5) :
 * - AC1 : une note vocale est une bulle DESSINÉE — « Lire », une onde, « 0:23 » — sans le lecteur
 *   natif (`<audio controls>`) ; sans `AudioContext` (jsdom), l'onde neutre, jamais une bulle vide ;
 * - AC3 : en tête du fil, « Charger les messages précédents » (au lieu de la sentinelle) appelle la
 *   page précédente, et le message lu ne bouge pas à l'écran.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { Message } from '@/types/message';
import { ChatView } from '../ChatView';

function message(id: number, extra: Partial<Message> = {}): Message {
  return {
    id,
    conversation_id: 7,
    sender_id: 2,
    type: 'text',
    content: `Message ${id}`,
    attachments: [],
    created_at: `2026-11-11T11:${String(id % 60).padStart(2, '0')}:00Z`,
    updated_at: `2026-11-11T11:${String(id % 60).padStart(2, '0')}:00Z`,
    ...extra,
  } as Message;
}

const NOTE = message(60, {
  type: 'audio',
  content: '',
  metadata: { duration: 23 } as Message['metadata'],
  attachments: [{ id: 41, name: 'note.webm', url: 'https://api.test/api/media/private/41', mime_type: 'audio/webm', size: 10 }],
});

let pages: { meta: { has_more: boolean }; data: Message[] }[] = [];
let hasNextPage = false;
const fetchNextPage = vi.fn();

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type: 'direct', participants: [] } } }),
  useMessagesInfinite: () => ({
    data: { pageParams: pages.map(() => undefined), pages },
    isLoading: false,
    isError: false,
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
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
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

beforeEach(() => {
  pages = [];
  hasNextPage = false;
  fetchNextPage.mockReset();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('<ChatView> — la note vocale dessinée (TCK-2861, AC1)', () => {
  it('une note de 23 s : « Lire », l’onde, « 0:23 », et aucun lecteur natif visible', () => {
    pages = [{ meta: { has_more: false }, data: [NOTE] }];
    const { container } = render(withIntl(<ChatView conversationId={7} />));

    const note = screen.getByRole('group', { name: 'Note vocale' });
    expect(within(note).getByRole('button', { name: 'Lire' })).toBeInTheDocument();
    expect(note).toHaveTextContent('0:23');
    expect(container.querySelector('audio[controls]')).toBeNull();
    // L'élément reste (la relecture d'une URL périmée écoute son `error`), caché.
    expect(container.querySelector('audio')).toHaveClass('hidden');
    // Sans `AudioContext` : l'onde neutre, 28 barres — jamais une bulle vide.
    expect(within(note).getByTestId('onde-de-la-note').children).toHaveLength(28);
  });

  it('la lecture se lit sur l’élément : « Pause » pendant, « Lire » après', async () => {
    pages = [{ meta: { has_more: false }, data: [NOTE] }];
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { container } = render(withIntl(<ChatView conversationId={7} />));
    const audio = container.querySelector('audio')!;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lire' }));
    });
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.play(audio);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.ended(audio);
    expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  });
});

describe('<ChatView> — « Charger les messages précédents » (TCK-2861, AC3)', () => {
  const recents = Array.from({ length: 30 }, (_, i) => message(31 + i));
  const anciens = Array.from({ length: 30 }, (_, i) => message(1 + i));

  it('sans page précédente, pas de bouton', () => {
    pages = [{ meta: { has_more: false }, data: recents }];
    render(withIntl(<ChatView conversationId={7} />));
    expect(screen.queryByRole('button', { name: 'Charger les messages précédents' })).not.toBeInTheDocument();
  });

  it('fil de 60 : les 30 derniers, le bouton en tête ; le toucher charge la page précédente sans déplacer la lecture', () => {
    pages = [{ meta: { has_more: true }, data: recents }];
    hasNextPage = true;
    const { rerender } = render(withIntl(<ChatView conversationId={7} />));

    expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
    expect(screen.getByText('Message 31')).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: 'Charger les messages précédents' });
    const liste = bouton.closest('ul')!;
    // En tête du fil : le premier élément de la liste.
    expect(liste.firstElementChild).toContainElement(bouton);

    // La personne lit à 40 px du haut d'un fil de 1 000 px.
    const fil = liste.parentElement!;
    let hauteur = 1000;
    Object.defineProperty(fil, 'scrollHeight', { configurable: true, get: () => hauteur });
    fil.scrollTop = 40;

    fireEvent.click(bouton);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // La page précédente arrive, 600 px au-dessus : la lecture reste sur le même message.
    hauteur = 1600;
    pages = [{ meta: { has_more: true }, data: recents }, { meta: { has_more: false }, data: anciens }];
    hasNextPage = false;
    rerender(withIntl(<ChatView conversationId={7} />));
    expect(screen.getByText('Message 1')).toBeInTheDocument();
    expect(fil.scrollTop).toBe(640);
  });
});
