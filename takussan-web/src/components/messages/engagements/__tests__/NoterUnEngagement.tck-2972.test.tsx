/**
 * TCK-2972 (ADR-0130 § 2) — « Noter un engagement » depuis un message :
 *
 * · le formulaire est prérempli : le message source cité, son auteur porteur (personnel) ;
 * · un client ne note que sa propre promesse : aucun autre porteur proposé ;
 * · l'envoi part sur `POST /api/conversations/{id}/commitments`, la date seule à la fin du jour à Dakar ;
 * · dans le fil : le geste existe sur un message, jamais sur une note d'équipe, ni sous impersonation.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
let impersonation = false;
vi.mock('@/lib/impersonation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/impersonation')>()),
  relaisImpersonationActif: () => impersonation,
}));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

let conversation: Partial<Conversation> = {};
let contexte: Partial<ConversationContext> | undefined;
let messages: Partial<Message>[] = [];

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
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useSendAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('../../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));
vi.mock('../../poser/PoserDansLeFil', () => ({ usePoserDansLeFil: () => ({ entrees: [], feuilles: null }) }));

const { AuthProvider } = await import('@/context/AuthContext');
const { TempsReelProvider } = await import('@/lib/temps-reel/TempsReelProvider');
const { ChatView } = await import('../../ChatView');

const AGENT = { id: 7, full_name: 'Sokhna Sène', roles: ['agent'] } as unknown as User;
const LOCATAIRE = { id: 9, full_name: 'Fatou Wade', roles: ['tenant'] } as unknown as User;

function participant(id: number, nom: string) {
  return { user_id: id, left_at: null, role: 'member', user: { id, full_name: nom, avatar_url: null } };
}

function message(id: number, auteur: number, nom: string, contenu: string, extra: Partial<Message> = {}): Partial<Message> {
  return {
    id,
    conversation_id: 3,
    sender_id: auteur,
    sender: { id: auteur, full_name: nom } as Message['sender'],
    content: contenu,
    type: 'text',
    visibility: 'all',
    attachments: [],
    created_at: '2026-11-18T11:02:00Z',
    updated_at: '2026-11-18T11:02:00Z',
    ...extra,
  };
}

function monter(moi: User) {
  window.__TAKUSSAN_CONFIG__ = { apiUrl: 'http://api.test', mediaUrl: '', tempsReelUrl: 'ws://127.0.0.1:8081', tempsReelCle: 'cle-dev' };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={moi} initialToken="jeton">
          <TempsReelProvider impersonation={false}>
            <ChatView conversationId={3} />
          </TempsReelProvider>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

const SOURCE = 'La pièce est arrivée. Je repasse jeudi à 10 h pour changer le siphon.';

beforeEach(() => {
  reinitialiser();
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: [] });
  impersonation = false;
  conversation = {
    id: 3,
    type: 'direct',
    participants: [participant(7, 'Sokhna Sène'), participant(9, 'Fatou Wade'), participant(30, 'Astou Sy')],
    abilities: { can_send_message: true },
  } as unknown as Partial<Conversation>;
  contexte = { can_write_team_note: true, team_note_reader_ids: [7], participants: [] } as unknown as Partial<ConversationContext>;
  messages = [message(101, 30, 'Astou Sy', SOURCE)];
});

describe('TCK-2972 — noter un engagement depuis un message', () => {
  it('le personnel : prérempli depuis le message (citation, porteur = son auteur), puis POST au fil', async () => {
    monter(AGENT);
    fireEvent.click(screen.getByTestId('noter-un-engagement-depuis-le-message'));
    const formulaire = await screen.findByTestId('noter-un-engagement');
    expect(screen.getByTestId('message-source').textContent).toContain(SOURCE);
    expect(screen.getByTestId('message-source').textContent).toContain('Astou Sy');
    expect((screen.getByRole('radio', { name: 'Astou Sy' }) as HTMLInputElement).checked).toBe(true);
    // Le personnel peut choisir un autre porteur.
    expect(screen.getAllByRole('radio', { name: 'Fatou Wade' }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('À quoi'), { target: { value: 'Repasser changer le siphon' } });
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2099-11-19' } });
    fireEvent.click(screen.getAllByRole('radio', { name: 'Fatou Wade' }).at(-1)!);
    fireEvent.submit(formulaire);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/api/conversations/3/commitments',
        expect.objectContaining({
          method: 'POST',
          body: { source_message_id: 101, holder_id: 30, beneficiary_id: 9, title: 'Repasser changer le siphon', due_at: '2099-11-19T23:59:59+00:00' },
        }),
      ),
    );
  });

  it('un client ne note que sa propre promesse : aucun autre porteur proposé', async () => {
    contexte = { can_write_team_note: false, team_note_reader_ids: [], participants: [], property: { id: 12 } } as unknown as Partial<ConversationContext>;
    monter(LOCATAIRE);
    fireEvent.click(screen.getByTestId('noter-un-engagement-depuis-le-message'));
    await screen.findByTestId('noter-un-engagement');
    const porteur = screen.getByRole('group', { name: 'Qui s’engage' });
    const choix = porteur.querySelectorAll('input[type=radio]');
    expect(choix).toHaveLength(1);
    expect((choix[0] as HTMLInputElement).checked).toBe(true);
    expect(porteur.textContent).toBe('Qui s’engageVous');
  });

  it('aucun geste sur une note d’équipe', () => {
    messages = [message(102, 7, 'Sokhna Sène', 'Note pour l’équipe', { visibility: 'team' })];
    monter(AGENT);
    expect(screen.getByText('Note pour l’équipe')).toBeTruthy();
    expect(screen.queryByTestId('noter-un-engagement-depuis-le-message')).toBeNull();
  });

  it('un fil sans agence (ni personnel, ni bien, ni bail, ni intervention) : aucun geste, l’API refuserait', () => {
    contexte = { can_write_team_note: false, team_note_reader_ids: [], participants: [], property: null, lease: null, maintenance: null } as unknown as Partial<ConversationContext>;
    monter(LOCATAIRE);
    expect(screen.getByText(SOURCE)).toBeTruthy();
    expect(screen.queryByTestId('noter-un-engagement-depuis-le-message')).toBeNull();
  });

  it('aucun geste sous impersonation', () => {
    impersonation = true;
    monter(AGENT);
    expect(screen.getByText(SOURCE)).toBeTruthy();
    expect(screen.queryByTestId('noter-un-engagement-depuis-le-message')).toBeNull();
  });
});

describe('TCK-2972 — l’appui long (téléphone)', () => {
  it('un appui de 500 ms sur la bulle ouvre « Ce message », puis le formulaire', async () => {
    vi.useFakeTimers();
    try {
      monter(AGENT);
      const bulle = screen.getByText(SOURCE).closest('div')!;
      fireEvent.pointerDown(bulle, { pointerType: 'touch', clientX: 10, clientY: 10 });
      fireEvent.pointerMove(bulle, { pointerType: 'touch', clientX: 13, clientY: 12 });
      await vi.advanceTimersByTimeAsync(500);
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Noter un engagement' }));
    expect(await screen.findByTestId('noter-un-engagement')).toBeTruthy();
  });
});
