/**
 * TCK-2962 (AC5, ADR-0129 § 2) — un signal sur le fil relit la page, et la carte change d'état sans
 * recharger l'écran.
 *
 * Sur le faux Echo et le vrai `TempsReelProvider` : `message.created` fait relire les messages neufs
 * (`useFilEnDirect`, TCK-2955) ; l'événement que l'objet a écrit (TCK-2961) arrive dans le fil, et
 * `useCartesEnDirect` relit alors les pages chargées, où la carte plus haut porte sa projection neuve.
 * Les requêtes du fil sont doublées par un petit magasin : une relecture invalidée y publie la réponse
 * que l'API rendrait.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import { instances, reinitialiser, type FauxEcho } from '@/lib/temps-reel/__tests__/faux-echo';

vi.mock('laravel-echo', async () => ({ default: (await import('@/lib/temps-reel/__tests__/faux-echo')).FauxEcho }));
vi.mock('pusher-js', () => ({ default: class FauxPusher {} }));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const magasin = {
  messages: [] as unknown[],
  abonnes: new Set<() => void>(),
  publier(messages: unknown[]) {
    this.messages = messages;
    for (const f of this.abonnes) f();
  },
};

vi.mock('@/lib/queries/conversations', async () => {
  const { useSyncExternalStore } = await import('react');
  const suivre = (f: () => void) => {
    magasin.abonnes.add(f);
    return () => magasin.abonnes.delete(f);
  };
  return {
    useConversation: () => ({ data: { data: { id: 7, type: 'group', participants: [] } } }),
    useMessagesInfinite: () => {
      const messages = useSyncExternalStore(suivre, () => magasin.messages);
      return {
        data: { pages: [{ data: messages }] },
        isLoading: false,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      };
    },
    useNewMessagesPolling: vi.fn(),
    useMarkConversationRead: vi.fn(),
    useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useSendAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useConversationContext: () => ({ data: undefined }),
    useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }),
    useToggleMute: () => ({ mutate: vi.fn() }),
  };
});
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

const { AuthProvider } = await import('@/context/AuthContext');
const { TempsReelProvider } = await import('@/lib/temps-reel/TempsReelProvider');
const { ChatView } = await import('../ChatView');

const MOI = { id: 7, full_name: 'Sokhna Sène', roles: [] } as unknown as User;
const CONFIG = { apiUrl: 'http://api.test', mediaUrl: '', tempsReelUrl: 'ws://127.0.0.1:8081', tempsReelCle: 'cle-dev' };
const CANAL = 'private-sujet.conversation.7';

function devis(etat: 'a-decider' | 'approuve') {
  return {
    id: 4,
    title: 'Fuite sous l’évier',
    status: etat === 'a-decider' ? 'quote_submitted' : 'approved',
    quote_amount: 85000,
    quote_currency: 'XOF',
    abilities: { can_decide_quote: etat === 'a-decider', can_view_quote_pdf: true },
  };
}

function evenement(id: number, code: string, objet: unknown, actionAttendue: boolean) {
  return {
    id,
    conversation_id: 7,
    sender_id: null,
    sender: null,
    attachments: [],
    type: 'event',
    content: code,
    metadata: { object: { type: 'maintenance_request', id: 4 }, code, data: { status: 'quote_submitted' } },
    object: objet,
    action_attendue: actionAttendue,
    created_at: `2026-11-18T11:${String(id).padStart(2, '0')}:00Z`,
    updated_at: `2026-11-18T11:${String(id).padStart(2, '0')}:00Z`,
  };
}

const TEXTE = { id: 20, conversation_id: 7, sender_id: 9, sender: { id: 9, full_name: 'Astou Sy' }, attachments: [], type: 'text', content: 'Devis envoyé', created_at: '2026-11-18T11:30:00Z', updated_at: '2026-11-18T11:30:00Z' };

const cle = (k: QueryKey | undefined) => JSON.stringify(k);

let client: QueryClient;

beforeEach(() => {
  reinitialiser();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_chemin: string, options: { body?: { channel_name?: string } }) => ({
    auth: `cle-dev:signature-${options.body?.channel_name}`,
  }));
  magasin.abonnes.clear();
  magasin.messages = [evenement(10, 'maintenance.quote_submitted', devis('a-decider'), true), TEXTE];
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  delete window.__TAKUSSAN_CONFIG__;
  vi.unstubAllGlobals();
});

async function monterEnDirect(): Promise<FauxEcho> {
  window.__TAKUSSAN_CONFIG__ = CONFIG;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={MOI} initialToken="jeton">
          <TempsReelProvider impersonation={false}>
            <ChatView conversationId={7} />
          </TempsReelProvider>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  const echo = instances[0]!;
  act(() => echo.statut('connected'));
  await waitFor(() => expect(echo.canaux.get(CANAL)?.autorise).toBe(true));
  return echo;
}

describe('AC5 — la carte se relit sur le signal du fil', () => {
  it('message.created → l’événement de l’objet arrive → les pages se relisent → la carte passe à « Validés »', async () => {
    const echo = await monterEnDirect();
    expect(screen.getByText('À vous d’approuver')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approuver le devis' })).toBeInTheDocument();

    const relues: string[] = [];
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filtre) => {
      const k = cle(filtre?.queryKey);
      relues.push(k);
      // La relecture `after_id` : l'API rend l'événement neuf, écrit par l'objet.
      if (k === cle(['conversations', 7, 'messages', 'live'])) {
        magasin.publier([...magasin.messages, evenement(40, 'maintenance.quote_approved', devis('approuve'), false)]);
      }
      // Les pages chargées : la carte plus haut porte la projection neuve.
      if (k === cle(['conversations', 7, 'messages-infinite'])) {
        magasin.publier([evenement(10, 'maintenance.quote_submitted', devis('approuve'), true), TEXTE, evenement(40, 'maintenance.quote_approved', devis('approuve'), false)]);
      }
    });

    act(() => echo.canaux.get(CANAL)!.emettre('.signal', { subject: 'conversation:7', event: 'message.created', cursor: '2026-11-18T11:40:00.000001Z' }));

    await waitFor(() => expect(screen.getByText('Validés')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Approuver le devis' })).toBeNull();
    expect(relues).toContain(cle(['conversations', 7, 'messages-infinite']));
  });

  it('un message texte neuf ne relit pas les pages chargées', async () => {
    const echo = await monterEnDirect();
    const relues: string[] = [];
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filtre) => {
      const k = cle(filtre?.queryKey);
      relues.push(k);
      if (k === cle(['conversations', 7, 'messages', 'live'])) {
        magasin.publier([...magasin.messages, { ...TEXTE, id: 41, content: 'Merci' }]);
      }
    });

    act(() => echo.canaux.get(CANAL)!.emettre('.signal', { subject: 'conversation:7', event: 'message.created', cursor: '2026-11-18T11:41:00.000001Z' }));

    await waitFor(() => expect(screen.getByText('Merci')).toBeInTheDocument());
    expect(relues).not.toContain(cle(['conversations', 7, 'messages-infinite']));
    expect(screen.getByText('À vous d’approuver')).toBeInTheDocument();
  });
});
