/**
 * TCK-2736 — le branchement : la pièce d'un message relit le fil par le `refetch` de la requête
 * infinie que `ChatView` tient déjà, et reprend l'URL neuve par l'identifiant de la pièce. Un fil
 * qui ne se relit pas (participant retiré) n'ouvre rien.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { Message } from '@/types/message';
import { ChatView } from '../ChatView';

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);
const PERIMEE = `https://api.test/api/media/private/9?expires=${Math.floor((T0 - 1_000) / 1000)}&signature=a`;

let type: Message['type'] = 'document';

function message(url: string): Message {
  return {
    id: 5,
    conversation_id: 7,
    sender_id: 2,
    type,
    content: 'Le plan',
    attachments: [{ id: 41, name: 'plan.pdf', url, mime_type: 'application/pdf', size: 10 }],
    created_at: '2026-11-11T11:58:00Z',
    updated_at: '2026-11-11T11:58:00Z',
  } as Message;
}
const pages = (url: string) => ({ pageParams: [undefined], pages: [{ meta: { has_more: false }, data: [message(url)] }] });

const refetch = vi.fn();

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type: 'direct', participants: [] } } }),
  useMessagesInfinite: () => ({
    data: pages(PERIMEE),
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch,
  }),
  useNewMessagesPolling: vi.fn(),
  useMarkConversationRead: vi.fn(),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // TCK-2632 — l'en-tête du fil lit le contexte (appel, WhatsApp) et porte la sourdine.
  useConversationContext: () => ({ data: undefined }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

let onglet: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(T0);
  onglet = { opener: {}, location: { href: '' }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(onglet as unknown as Window);
  refetch.mockReset();
  type = 'document';
});
afterEach(() => vi.restoreAllMocks());

describe('<ChatView> — pièce jointe périmée (TCK-2736)', () => {
  it("relit le fil et ouvre l'URL neuve de la même pièce", async () => {
    refetch.mockResolvedValue({ isError: false, data: pages('https://api.test/neuve') });
    render(withIntl(<ChatView conversationId={7} />));

    fireEvent.click(screen.getByRole('link', { name: /^plan\.pdf/ }));

    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onglet.location.href).toBe('https://api.test/neuve'));
    expect(onglet.close).not.toHaveBeenCalled();
  });

  it("n'ouvre rien quand le fil ne se relit plus", async () => {
    refetch.mockResolvedValue({ isError: true, data: pages('https://api.test/neuve') });
    render(withIntl(<ChatView conversationId={7} />));

    fireEvent.click(screen.getByRole('link', { name: /^plan\.pdf/ }));

    await waitFor(() => expect(onglet.close).toHaveBeenCalledTimes(1));
    expect(onglet.location.href).toBe('');
  });

  it("une note vocale qui échoue relit le fil et rejoue l'URL neuve", async () => {
    type = 'audio';
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    refetch.mockResolvedValue({ isError: false, data: pages('https://api.test/neuve') });
    const { container } = render(withIntl(<ChatView conversationId={7} />));
    const audio = () => container.querySelector('audio')!;

    await act(async () => {
      fireEvent.error(audio());
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(audio().getAttribute('src')).toBe('https://api.test/neuve'));
    expect(play).toHaveBeenCalledTimes(1);
  });
});
