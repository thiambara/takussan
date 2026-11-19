/**
 * TCK-2978 (ADR-0131 § 5) — le brouillon dans le composeur et les promesses sous les messages :
 *  - le brouillon reçu remplit le champ SANS aucun `POST …/messages` ; « Envoyer » tel quel → `accepted`,
 *    retouché → `edited` avec le texte envoyé ; « Jeter » → `rejected` ;
 *  - ✦ du composeur n'existe qu'en mode Fil ;
 *  - « Écarter » → `rejected` et bloc replié ; « Noter l'engagement » crée par la route du lot 3.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import type { Conversation, ConversationContext, Message } from '@/types/message';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const envoyer = vi.fn();
let conversation: Partial<Conversation> = {};
let messages: Partial<Message>[] = [];
const contexte: Partial<ConversationContext> = {
  team_note_reader_ids: [7],
  can_write_team_note: true,
  participants: [
    { user_id: 7, relation: 'agent', reads_team_notes: true },
    { user_id: 9, relation: 'locataire', reads_team_notes: false },
  ],
} as unknown as Partial<ConversationContext>;

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
  useConversationContext: () => ({ data: { data: contexte } }),
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
const { ChatView } = await import('../ChatView');
const { oublierLesDemandesDuCopilote } = await import('@/lib/queries/copilote');

const AGENT = { id: 7, full_name: 'Sokhna Sène', roles: ['agent'] } as unknown as User;
const BROUILLON = 'Bonjour M. Fall, je reviens vers vous dès que le propriétaire a répondu.';

function participant(id: number, nom: string) {
  return { user_id: id, left_at: null, last_read_at: '2026-11-19T00:00:00Z', role: 'member', user: { id, full_name: nom, avatar_url: null } };
}

let sortes: Record<string, unknown> = {};

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={AGENT} initialToken="jeton">
          <ChatView conversationId={42} />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

const appels = (fin: string) => apiRequest.mock.calls.filter((c) => String(c[0]).endsWith(fin));
const champ = () => document.querySelector('textarea') as HTMLTextAreaElement;

beforeEach(() => {
  oublierLesDemandesDuCopilote();
  envoyer.mockReset();
  envoyer.mockResolvedValue({ data: {} });
  apiRequest.mockReset();
  sortes = { resume: { statut: 'aucun' }, brouillon: { statut: 'aucun' }, promesses: { statut: 'aucun' } };
  apiRequest.mockImplementation(async (chemin: string, options?: { method?: string }) => {
    if (chemin.endsWith('/copilote')) return { data: { conversation_id: 42, sortes } };
    if (chemin.endsWith('/copilote/brouillon') && options?.method === 'POST') {
      sortes = { ...sortes, brouillon: { statut: 'prete', suggestion_id: 88, proposition: { texte: BROUILLON, appuis: [{ type: 'lease', id: 3 }] } } };
    }
    return {};
  });
  messages = [
    { id: 1, conversation_id: 42, sender_id: 9, content: 'Je repasse jeudi à 10 h.', type: 'text', attachments: [], visibility: 'all', created_at: '2026-11-18T09:00:00Z' },
  ];
  conversation = { id: 42, type: 'direct', copilote: true, participants: [participant(7, 'Sokhna Sène'), participant(9, 'Astou Sy')] } as unknown as Partial<Conversation>;
});

async function recevoirLeBrouillon() {
  monter();
  fireEvent.click(await screen.findByTestId('bouton-brouillon'));
  await waitFor(() => expect(champ().value).toBe(BROUILLON));
  expect(screen.getByTestId('brouillon-de-l-assistant').textContent).toContain('Brouillon de l’assistant · relisez avant d’envoyer');
}

describe('TCK-2978 — le brouillon dans le composeur', () => {
  it('le brouillon reçu remplit le champ sans aucun POST …/messages', async () => {
    await recevoirLeBrouillon();
    expect(appels('/copilote/brouillon')).toHaveLength(1);
    expect(appels('/messages')).toEqual([]);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('« Envoyer » tel quel → `accepted`', async () => {
    await recevoirLeBrouillon();
    fireEvent.keyDown(champ(), { key: 'Enter' });
    await waitFor(() => expect(envoyer).toHaveBeenCalledWith(expect.objectContaining({ content: BROUILLON })));
    await waitFor(() => expect(appels('/api/copilote/suggestions/88/decision')).toHaveLength(1));
    expect(appels('/api/copilote/suggestions/88/decision')[0]![1]).toMatchObject({ method: 'PUT', body: { decision: 'accepted' } });
  });

  it('retouché puis envoyé → `edited` avec le texte envoyé, et le cadre disparaît dès la retouche', async () => {
    await recevoirLeBrouillon();
    fireEvent.change(champ(), { target: { value: `${BROUILLON} Merci.` } });
    expect(screen.queryByTestId('brouillon-de-l-assistant')).toBeNull();
    fireEvent.keyDown(champ(), { key: 'Enter' });
    await waitFor(() => expect(appels('/api/copilote/suggestions/88/decision')).toHaveLength(1));
    expect(appels('/api/copilote/suggestions/88/decision')[0]![1]).toMatchObject({ body: { decision: 'edited', final: { texte: `${BROUILLON} Merci.` } } });
  });

  it('« Jeter le brouillon » → `rejected`, champ vidé, rien d’envoyé', async () => {
    await recevoirLeBrouillon();
    fireEvent.click(screen.getByRole('button', { name: 'Jeter le brouillon' }));
    await waitFor(() => expect(appels('/api/copilote/suggestions/88/decision')).toHaveLength(1));
    expect(appels('/api/copilote/suggestions/88/decision')[0]![1]).toMatchObject({ body: { decision: 'rejected' } });
    expect(champ().value).toBe('');
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('✦ du composeur est absent en mode Équipe', async () => {
    monter();
    expect(await screen.findByTestId('bouton-brouillon')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Équipe' }));
    await waitFor(() => expect(screen.queryByTestId('bouton-brouillon')).toBeNull());
  });
});

describe('TCK-2978 — les promesses repérées', () => {
  const PROMESSE = { suggestion_id: 61, proposition: { message_id: 1, porteur_id: 9, libelle: 'Repasser changer le siphon', echeance: '2026-11-26T10:00:00+00:00' } };

  it('demandées à l’ouverture ; « Écarter » → `rejected` et bloc replié', async () => {
    sortes = { ...sortes, promesses: { statut: 'prete', promesses: [PROMESSE] } };
    monter();
    await waitFor(() => expect(appels('/copilote/promesses')).toHaveLength(1));
    const bloc = await screen.findByTestId('promesses-du-message');
    expect(bloc.textContent).toContain('Astou Sy · Repasser changer le siphon');
    fireEvent.click(within(bloc).getByRole('button', { name: 'Écarter' }));
    await waitFor(() => expect(appels('/api/copilote/suggestions/61/decision')).toHaveLength(1));
    expect(appels('/api/copilote/suggestions/61/decision')[0]![1]).toMatchObject({ body: { decision: 'rejected' } });
    expect(screen.queryByTestId('promesses-du-message')).toBeNull();
  });

  it('« Noter l’engagement » crée par la route du lot 3, pré-rempli ; puis `accepted`', async () => {
    sortes = { ...sortes, promesses: { statut: 'prete', promesses: [PROMESSE] } };
    monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Noter l’engagement' }));
    const formulaire = await screen.findByTestId('noter-un-engagement');
    const avantCreation = apiRequest.mock.calls.length;
    expect(appels('/commitments')).toEqual([]);
    fireEvent.submit(formulaire);
    await waitFor(() => expect(appels('/api/conversations/42/commitments')).toHaveLength(1));
    expect(appels('/api/conversations/42/commitments')[0]![1]).toMatchObject({
      method: 'POST',
      body: { source_message_id: 1, holder_id: 9, title: 'Repasser changer le siphon', due_at: '2026-11-26T10:00:00+00:00' },
    });
    // Aucune route du copilote ne crée : après la création, seule la décision part.
    const apres = apiRequest.mock.calls.slice(avantCreation).map((c) => String(c[0]));
    expect(apres.filter((c) => c.includes('/copilote/') && !c.includes('/decision'))).toEqual([]);
    await waitFor(() => expect(appels('/api/copilote/suggestions/61/decision')).toHaveLength(1));
    expect(appels('/api/copilote/suggestions/61/decision')[0]![1]).toMatchObject({ body: { decision: 'accepted' } });
  });
});
