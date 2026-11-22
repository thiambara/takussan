/**
 * TCK-2955 (ADR-0129 § 2) — le fil ouvert en direct, sur le faux Echo (`faux-echo.ts`) et le vrai
 * `TempsReelProvider` : le signal relit ce qu'il dit changé, la présence marque l'en-tête, « en train
 * d'écrire » passe de navigateur à navigateur sans jamais toucher l'API, et rien de tout cela n'existe sous
 * impersonation. Les requêtes du fil sont doublées (comme dans les autres tests de `ChatView`) : ce qui
 * est éprouvé ici est le branchement de l'écran, la relecture elle-même l'est par `en-direct.tck-2955`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { instances, reinitialiser, type FauxEcho } from '@/lib/temps-reel/__tests__/faux-echo';

vi.mock('laravel-echo', async () => ({ default: (await import('@/lib/temps-reel/__tests__/faux-echo')).FauxEcho }));
vi.mock('pusher-js', () => ({ default: class FauxPusher {} }));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

let conversation: Partial<Conversation> = {};

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
  useMessagesInfinite: () => ({
    data: { pages: [{ data: [{ id: 500, conversation_id: 7, sender_id: 9, content: 'Bonjour', type: 'text', created_at: '2026-11-18T09:00:00Z' }] }] },
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

const { AuthProvider } = await import('@/context/AuthContext');
const { TempsReelProvider } = await import('@/lib/temps-reel/TempsReelProvider');
const { DELAI_D_EFFACEMENT_MS } = await import('@/lib/temps-reel/ecriture');
const { ChatView } = await import('../ChatView');

const MOI = { id: 7, full_name: 'Awa Ndiaye', roles: [] } as unknown as User;
const CONFIG = { apiUrl: 'http://api.test', mediaUrl: '', tempsReelUrl: 'ws://127.0.0.1:8081', tempsReelCle: 'cle-dev' };
const PRESENCE = 'presence-sujet.conversation.7';

function participant(id: number, nom: string, partiLe: string | null = null) {
  return { user_id: id, left_at: partiLe, role: 'member', user: { id, full_name: nom } };
}

let client: QueryClient;

function monter({ impersonation = false } = {}) {
  window.__TAKUSSAN_CONFIG__ = CONFIG;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={MOI} initialToken="jeton">
          <TempsReelProvider impersonation={impersonation}>
            <ChatView conversationId={7} />
          </TempsReelProvider>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

async function connexionTenue(): Promise<FauxEcho> {
  await waitFor(() => expect(instances).toHaveLength(1));
  const echo = instances[0]!;
  act(() => echo.statut('connected'));
  await waitFor(() => expect(echo.canaux.get('private-sujet.conversation.7')?.autorise).toBe(true));
  await waitFor(() => expect(echo.canaux.has(PRESENCE)).toBe(true));
  return echo;
}

function appelsHorsAutorisation() {
  return apiRequest.mock.calls.filter(([chemin]) => chemin !== '/api/broadcasting/auth');
}

beforeEach(() => {
  reinitialiser();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_chemin: string, options: { body?: { channel_name?: string } }) => ({
    auth: `cle-dev:signature-${options.body?.channel_name}`,
  }));
  conversation = {
    id: 7,
    type: 'direct',
    participants: [participant(7, 'Awa Ndiaye'), participant(9, 'Fatou Wade')],
  } as unknown as Partial<Conversation>;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__TAKUSSAN_CONFIG__;
  document.cookie = 'impersonation_active=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.unstubAllGlobals();
});

describe('AC5 — le signal du fil relit ce qu’il dit changé', () => {
  it('message.created relit les messages neufs ; participants.updated relit le fil et son contexte', async () => {
    monter();
    const echo = await connexionTenue();
    const relu = vi.spyOn(client, 'invalidateQueries');

    act(() =>
      echo.canaux
        .get('private-sujet.conversation.7')!
        .emettre('.signal', { subject: 'conversation:7', event: 'message.created', cursor: '2026-11-18T00:00:01.000001Z' }),
    );
    expect(relu.mock.calls.map(([f]) => f?.queryKey)).toEqual([['conversations', 7, 'messages', 'live']]);

    relu.mockClear();
    act(() =>
      echo.canaux
        .get('private-sujet.conversation.7')!
        .emettre('.signal', { subject: 'conversation:7', event: 'participants.updated', cursor: '2026-11-18T00:00:02.000001Z' }),
    );
    expect(relu.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ['conversations', 'detail', 7],
      ['conversations', 'context', 7],
      ['conversations', 7, 'contacts'],
    ]);
  });
});

describe('AC7 — présence et « en train d’écrire »', () => {
  it('la présence de l’autre participant marque l’en-tête ; ni la mienne ni un inconnu ne comptent', async () => {
    monter();
    const echo = await connexionTenue();
    expect(screen.queryByTestId('presence-du-fil')).toBeNull();

    act(() => echo.canaux.get(PRESENCE)!.membres([7, 99]));
    expect(screen.queryByTestId('presence-du-fil')).toBeNull();

    act(() => echo.canaux.get(PRESENCE)!.arrivee(9));
    expect(screen.getByRole('img', { name: 'Fatou Wade est dans la conversation' })).toBeInTheDocument();

    act(() => echo.canaux.get(PRESENCE)!.depart(9));
    expect(screen.queryByTestId('presence-du-fil')).toBeNull();
  });

  it('un participant parti n’est pas marqué présent', async () => {
    conversation = {
      id: 7,
      type: 'group',
      participants: [participant(7, 'Awa Ndiaye'), participant(9, 'Fatou Wade', '2026-11-17T10:00:00Z'), participant(11, 'Moussa Sow')],
    } as unknown as Partial<Conversation>;
    monter();
    const echo = await connexionTenue();

    act(() => echo.canaux.get(PRESENCE)!.membres([7, 9, 11]));
    expect(screen.getByRole('img', { name: '1 personne est dans la conversation' })).toBeInTheDocument();
  });

  it('un autre écrit : la ligne le nomme, puis s’efface seule ; mon écho et un inconnu sont ignorés', async () => {
    monter();
    const echo = await connexionTenue();
    vi.useFakeTimers();

    act(() => echo.canaux.get(PRESENCE)!.chuchotementRecu('ecrit', 7));
    act(() => echo.canaux.get(PRESENCE)!.chuchotementRecu('ecrit', 99));
    expect(screen.getByTestId('ecriture-du-fil').textContent).toBe('');

    act(() => echo.canaux.get(PRESENCE)!.chuchotementRecu('ecrit', '9'));
    expect(screen.getByTestId('ecriture-du-fil').textContent).toBe('Fatou Wade écrit…');

    act(() => {
      vi.advanceTimersByTime(DELAI_D_EFFACEMENT_MS - 1);
    });
    expect(screen.getByTestId('ecriture-du-fil').textContent).toBe('Fatou Wade écrit…');
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByTestId('ecriture-du-fil').textContent).toBe('');
  });

  it('écrire émet un seul message éphémère par intervalle, et rien ne passe par l’API', async () => {
    monter();
    const echo = await connexionTenue();
    const champ = screen.getByPlaceholderText('Écrivez un message…');

    fireEvent.change(champ, { target: { value: 'B' } });
    fireEvent.change(champ, { target: { value: 'Bo' } });
    fireEvent.change(champ, { target: { value: 'Bon' } });

    expect(echo.canaux.get(PRESENCE)!.chuchotements).toEqual([{ evenement: 'ecrit', charge: {} }]);
    expect(appelsHorsAutorisation()).toEqual([]);
  });

  it('fermer le fil quitte son canal de présence', async () => {
    const { unmount } = monter();
    const echo = await connexionTenue();
    unmount();
    expect(echo.quittes).toContain(PRESENCE);
  });

  it('connexion perdue : écrire n’émet rien', async () => {
    monter();
    const echo = await connexionTenue();
    act(() => echo.statut('connecting'));

    fireEvent.change(screen.getByPlaceholderText('Écrivez un message…'), { target: { value: 'B' } });
    expect(echo.canaux.get(PRESENCE)!.chuchotements).toEqual([]);
  });
});

describe('AC8 — sous impersonation, ni présence ni « en train d’écrire »', () => {
  it('aucune connexion, aucun canal de présence, aucune émission ; l’écran reste celui d’aujourd’hui', async () => {
    document.cookie = 'impersonation_active=1; path=/';
    monter({ impersonation: true });
    const champ = await screen.findByPlaceholderText('Écrivez un message…');

    fireEvent.change(champ, { target: { value: 'Bonjour' } });
    await new Promise((r) => setTimeout(r, 20));

    expect(instances).toHaveLength(0);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId('presence-du-fil')).toBeNull();
    expect(screen.getByTestId('ecriture-du-fil').textContent).toBe('');
  });
});
