/** TCK-2984 (ADR-0132) — le pont monté dans `ChatView` : la trace sous la bulle, le bandeau de la fenêtre. */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import type { Conversation, ConversationContext, Message } from '@/types/message';
import { reinitialiser } from '@/lib/temps-reel/__tests__/faux-echo';

vi.mock('laravel-echo', async () => ({ default: (await import('@/lib/temps-reel/__tests__/faux-echo')).FauxEcho }));
vi.mock('pusher-js', () => ({ default: class FauxPusher {} }));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

let conversation: Partial<Conversation> = {};
let contexte: Partial<ConversationContext> | undefined;
let messages: Partial<Message>[] = [];
const envoyer = vi.fn();

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
  useConversationContext: () => ({ data: contexte ? { data: contexte } : undefined }),
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
  useSendMessage: () => ({ mutateAsync: envoyer, isPending: false, error: null }),
  useSendAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));
vi.mock('../poser/PoserDansLeFil', () => ({ usePoserDansLeFil: () => ({ entrees: [], feuilles: null }) }));

const { AuthProvider } = await import('@/context/AuthContext');
const { TempsReelProvider } = await import('@/lib/temps-reel/TempsReelProvider');
const { ChatView } = await import('../ChatView');

const AGENT = { id: 7, full_name: 'Sokhna Sène', roles: ['agent'] } as unknown as User;
const LOCATAIRE = { id: 9, full_name: 'Ousmane Ndiaye', roles: ['tenant'] } as unknown as User;
const CONFIG = { apiUrl: 'http://api.test', mediaUrl: '', tempsReelUrl: 'ws://127.0.0.1:8081', tempsReelCle: 'cle-dev' };

function participant(id: number, nom: string) {
  return { user_id: id, left_at: null, role: 'member', user: { id, full_name: nom, avatar_url: null } };
}

let client: QueryClient;

function arbre(moi: User, conversationId = 7) {
  return withIntl(
    <QueryClientProvider client={client}>
      <AuthProvider initialUser={moi} initialToken="jeton">
        <TempsReelProvider impersonation={false}>
          <ChatView conversationId={conversationId} />
        </TempsReelProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function monter(moi: User = AGENT) {
  window.__TAKUSSAN_CONFIG__ = CONFIG;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(arbre(moi));
}


const FERMEE = '2000-01-01T00:00:00Z';

beforeEach(() => {
  reinitialiser();
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ auth: 'cle-dev:signature' });
  conversation = {
    id: 7,
    type: 'group',
    participants: [participant(7, 'Sokhna Sène'), participant(9, 'Ousmane Ndiaye')],
  } as unknown as Partial<Conversation>;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  delete window.__TAKUSSAN_CONFIG__;
  vi.unstubAllGlobals();
});

const MESSAGE: Partial<Message> = { id: 501, conversation_id: 7, sender_id: 7, content: 'Le plombier passe jeudi.', type: 'text', attachments: [], created_at: '2026-11-18T09:00:00Z' };

/** TCK-2984 — la bulle porte l'état des relais et la fenêtre fermée s'annonce, pour le personnel seul. */
describe('<ChatView> — le pont monté (TCK-2984)', () => {
  it('le personnel : l’état du relais sous sa bulle, et l’annonce du message type au-dessus du composeur', () => {
    contexte = { participants: [{ user_id: 9, relation: 'locataire', pont: { joint: true, invitable: false, fenetre_jusqu_a: FERMEE } }] };
    messages = [{ ...MESSAGE, channel: 'app', relays: [{ user_id: 9, channel: 'whatsapp', form: 'texte', status: 'read', at: '2026-11-18T09:01:00Z' }] } as Partial<Message>];
    monter(AGENT);
    expect(screen.getByTestId('relais').textContent).toContain('Ousmane Ndiaye par WhatsApp');
    expect(screen.getByTestId('etat-du-relais').textContent).toBe('lu');
    expect(screen.getByTestId('bandeau-fenetre').dataset.etat).toBe('fermee');
    expect(screen.getByTestId('annonce-message-type')).toBeTruthy();
    expect(screen.getByTestId('puce-du-pont').dataset.etat).toBe('fermee');
  });

  it('le locataire, même fil, réponse sans les clés du pont : ni relais, ni bandeau', () => {
    contexte = { participants: [{ user_id: 9, relation: 'locataire' }] };
    messages = [{ ...MESSAGE }];
    monter(LOCATAIRE);
    expect(screen.queryByTestId('pont-du-message')).toBeNull();
    expect(screen.queryByTestId('bandeau-fenetre')).toBeNull();
    expect(screen.queryByTestId('puces-du-pont')).toBeNull();
  });
});
