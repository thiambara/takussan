/**
 * TCK-2860 (AC5, AC6, données de TCK-2858) — la double coche « Lu » sur MES messages lus (direct :
 * `read_by_recipient` ; groupe : `read_count > 0`), jamais sur un message non lu ni sur celui d'un
 * autre ; dans un groupe, l'auteur signé de son rôle (« Fatou Wade · locataire ») par son CODE ; et
 * tant que mon dernier message attend sa coche, le fil se relit (le relevé `after_id` ne la rapporte
 * pas).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ChatView, RELECTURE_DE_LA_COCHE_MS } from '../ChatView';

let type: 'direct' | 'group' = 'direct';
let messages: unknown[] = [];
const relire = vi.fn();

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles: ['agent'] }, token: 't' }) }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type, participants: [] } } }),
  useMessagesInfinite: () => ({
    data: { pages: [{ data: messages }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: relire,
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

const message = (id: number, sender: { id: number; full_name: string; role_label_code?: string | null }, extra: Record<string, unknown> = {}) => ({
  id,
  conversation_id: 7,
  sender_id: sender.id,
  sender,
  content: `message ${id}`,
  type: 'text',
  attachments: [],
  created_at: `2026-11-10T08:${String(id).padStart(2, '0')}:00Z`,
  updated_at: `2026-11-10T08:${String(id).padStart(2, '0')}:00Z`,
  ...extra,
});
const MOI = { id: 1, full_name: 'Awa Diop' };
const FATOU = { id: 9, full_name: 'Fatou Wade', role_label_code: 'tenant' };

function bulle(texte: string): HTMLElement {
  return screen.getByText(texte).closest('li') as HTMLElement;
}

beforeEach(() => {
  type = 'direct';
  messages = [];
  relire.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('<ChatView> — « Lu » et le rôle de l’auteur (TCK-2860)', () => {
  it('AC5 — mon message lu porte « Lu » ; non lu, non ; celui de l’autre, jamais', () => {
    messages = [
      message(1, MOI, { read_by_recipient: true }),
      message(2, { id: 9, full_name: 'Malick Seck' }, { read_by_recipient: null }),
      message(3, MOI, { read_by_recipient: false }),
    ];
    render(withIntl(<ChatView conversationId={7} />));
    expect(within(bulle('message 1')).getByRole('img', { name: 'Lu' })).toBeInTheDocument();
    expect(within(bulle('message 2')).queryByRole('img', { name: 'Lu' })).toBeNull();
    expect(within(bulle('message 3')).queryByRole('img', { name: 'Lu' })).toBeNull();
  });

  it('groupe : « Lu » dès un lecteur (`read_count > 0`), pas à zéro', () => {
    type = 'group';
    messages = [message(1, MOI, { read_count: 2 }), message(2, MOI, { read_count: 0 })];
    render(withIntl(<ChatView conversationId={7} />));
    expect(within(bulle('message 1')).getByRole('img', { name: 'Lu' })).toBeInTheDocument();
    expect(within(bulle('message 2')).queryByRole('img', { name: 'Lu' })).toBeNull();
  });

  it('AC6 — dans le groupe, la bulle de Fatou Wade est signée « Fatou Wade · locataire »', () => {
    type = 'group';
    messages = [message(1, FATOU)];
    render(withIntl(<ChatView conversationId={7} />));
    expect(within(bulle('message 1')).getByText('Fatou Wade · locataire')).toBeInTheDocument();
  });

  it('un rôle nul ou inconnu laisse le nom seul', () => {
    type = 'group';
    messages = [message(1, { id: 9, full_name: 'Fatou Wade', role_label_code: null }), message(2, { id: 10, full_name: 'Ousmane Fall', role_label_code: 'inconnu' })];
    render(withIntl(<ChatView conversationId={7} />));
    expect(within(bulle('message 1')).getByText('Fatou Wade')).toBeInTheDocument();
    expect(within(bulle('message 2')).getByText('Ousmane Fall')).toBeInTheDocument();
  });

  it('mon dernier message non lu : le fil se relit toutes les 15 s ; lu, il ne se relit pas', () => {
    vi.useFakeTimers();
    messages = [message(1, MOI, { read_by_recipient: false })];
    const { unmount } = render(withIntl(<ChatView conversationId={7} />));
    act(() => {
      vi.advanceTimersByTime(RELECTURE_DE_LA_COCHE_MS);
    });
    expect(relire).toHaveBeenCalledTimes(1);
    unmount();

    relire.mockReset();
    messages = [message(1, MOI, { read_by_recipient: true })];
    render(withIntl(<ChatView conversationId={7} />));
    act(() => {
      vi.advanceTimersByTime(RELECTURE_DE_LA_COCHE_MS * 2);
    });
    expect(relire).not.toHaveBeenCalled();
  });
});
