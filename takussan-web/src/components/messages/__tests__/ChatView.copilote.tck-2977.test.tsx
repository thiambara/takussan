/**
 * TCK-2977 (ADR-0131) — le copilote dans `ChatView` :
 *  - un lecteur sans `copilote` (client, bailleur, prestataire, impersonation) : ni ✦, ni le mot « assistant »,
 *    ni bloc sous une note vocale, et AUCUNE requête `…/copilote` ni `…/transcription` ;
 *  - le résumé est demandé à l'ouverture d'un fil à 10 non-lus, pas à 9, avec le `depuis_message_id` relevé
 *    avant la marque de lecture (le `unread_count` de la liste, remis à 0 ensuite).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import type { Conversation, Message } from '@/types/message';

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

const envoyer = vi.fn();
let conversation: Partial<Conversation> = {};
let messages: Partial<Message>[] = [];

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
  useConversationContext: () => ({ data: undefined }),
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
const LOCATAIRE = { id: 9, full_name: 'Fatou Wade', roles: ['tenant'] } as unknown as User;

function participant(id: number, nom: string) {
  return { user_id: id, left_at: null, last_read_at: null, role: 'member', user: { id, full_name: nom, avatar_url: null } };
}

/** 12 messages du locataire (ids 1 à 12), puis une note vocale (13). */
function fil(): Partial<Message>[] {
  const liste: Partial<Message>[] = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    conversation_id: 42,
    sender_id: 9,
    content: `Message ${i + 1}`,
    type: 'text',
    attachments: [],
    created_at: `2026-11-18T09:${String(10 + i).padStart(2, '0')}:00Z`,
  }));
  return liste;
}

function monter(moi: User, nonLusDeLaListe: number | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (nonLusDeLaListe !== null) {
    client.setQueryData(['conversations', 'list', 'infinite', {}], { pages: [{ data: [{ id: 42, unread_count: nonLusDeLaListe }] }], pageParams: [1] });
  }
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={moi} initialToken="jeton">
          <ChatView conversationId={42} />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
  return client;
}

const chemins = () => apiRequest.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  impersonation = false;
  envoyer.mockReset();
  oublierLesDemandesDuCopilote();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (chemin: string) => (chemin.endsWith('/copilote') ? { data: { conversation_id: 42, sortes: { resume: { statut: 'en_cours' } } } } : {}));
  messages = fil();
  conversation = { id: 42, type: 'direct', participants: [participant(7, 'Sokhna Sène'), participant(9, 'Fatou Wade')] } as unknown as Partial<Conversation>;
});

describe('TCK-2977 — sans copilote, rien de l’assistant', () => {
  it('un client (copilote absent) : ni ✦, ni « assistant », ni requête …/copilote ni …/transcription', async () => {
    messages = [
      ...fil(),
      // Une note vocale, que l'API rend SANS la clé `transcription` à un client.
      { id: 13, conversation_id: 42, sender_id: 7, content: '', type: 'audio', attachments: [{ id: 1, name: 'n.webm', url: 'http://x/n.webm', mime_type: 'audio/webm', size: 10 }], created_at: '2026-11-18T10:00:00Z' },
    ];
    monter(LOCATAIRE, 12);
    await screen.findByText('Message 12');
    expect(screen.queryByTestId('bouton-assistant')).toBeNull();
    expect(screen.queryByText(/assistant/i)).toBeNull();
    expect(screen.queryByTestId('transcription-de-la-note')).toBeNull();
    expect(screen.queryByTestId('separateur-nouveaux')).toBeNull();
    expect(chemins().filter((c) => c.includes('/copilote') || c.includes('/transcription'))).toEqual([]);
  });

  it('copilote explicitement faux : même silence', async () => {
    conversation = { ...conversation, copilote: false };
    monter(AGENT, 12);
    await screen.findByText('Message 12');
    expect(screen.queryByTestId('bouton-assistant')).toBeNull();
    expect(chemins().filter((c) => c.includes('/copilote'))).toEqual([]);
  });
});

describe('TCK-2977 — le résumé à l’ouverture d’un fil chargé', () => {
  it('10 non-lus : ✦ présent, résumé demandé une fois, depuis le 10e message compté en partant du plus récent', async () => {
    conversation = { ...conversation, copilote: true };
    monter(AGENT, 10);
    expect(await screen.findByTestId('bouton-assistant')).toBeTruthy();
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote/resume'));
    const appel = apiRequest.mock.calls.find((c) => String(c[0]) === '/api/conversations/42/copilote/resume')!;
    expect(appel[1]).toMatchObject({ method: 'POST', body: { depuis_message_id: 3 } });
    expect(screen.getByTestId('separateur-nouveaux').textContent).toContain('10 nouveaux messages');
    expect(chemins().filter((c) => c.endsWith('/copilote/resume'))).toHaveLength(1);
  });

  it('rouvrir la même fenêtre (remontage) ne redemande pas le résumé', async () => {
    conversation = { ...conversation, copilote: true };
    monter(AGENT, 10);
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote/resume'));
    cleanup();
    monter(AGENT, 10);
    await screen.findByTestId('bouton-assistant');
    await waitFor(() => expect(screen.getByTestId('separateur-nouveaux')).toBeTruthy());
    expect(chemins().filter((c) => c.endsWith('/copilote/resume'))).toHaveLength(1);
  });

  it('9 non-lus : aucune demande de résumé', async () => {
    conversation = { ...conversation, copilote: true };
    monter(AGENT, 9);
    await screen.findByTestId('bouton-assistant');
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote'));
    expect(chemins().filter((c) => c.endsWith('/copilote/resume'))).toEqual([]);
  });

  it('la fenêtre est relevée AVANT la marque de lecture : la liste remise à 0 ensuite ne change pas la demande', async () => {
    conversation = { ...conversation, copilote: true };
    const client = monter(AGENT, 10);
    // La marque de lecture relit la liste : `unread_count` retombe à 0.
    client.setQueryData(['conversations', 'list', 'infinite', {}], { pages: [{ data: [{ id: 42, unread_count: 0 }] }], pageParams: [1] });
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote/resume'));
    const appel = apiRequest.mock.calls.find((c) => String(c[0]) === '/api/conversations/42/copilote/resume')!;
    expect(appel[1]).toMatchObject({ body: { depuis_message_id: 3 } });
  });
});

describe('TCK-2977 — fermé par défaut', () => {
  it('compte inconnu (ni liste, ni lecteur dans les participants) : ni séparateur, ni demande de résumé', async () => {
    conversation = { id: 42, type: 'direct', copilote: true, participants: [participant(9, 'Fatou Wade')] } as unknown as Partial<Conversation>;
    monter(AGENT, null);
    await screen.findByTestId('bouton-assistant');
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote'));
    expect(screen.queryByTestId('separateur-nouveaux')).toBeNull();
    expect(chemins().filter((c) => c.endsWith('/copilote/resume'))).toEqual([]);
  });

  it('sous impersonation, même avec `copilote` vrai : ni ✦, ni requête …/copilote ni …/transcription', async () => {
    impersonation = true;
    conversation = { ...conversation, copilote: true };
    messages = [
      ...fil(),
      {
        id: 13, conversation_id: 42, sender_id: 9, content: '', type: 'audio', transcription: { etat: 'aucune' },
        attachments: [{ id: 1, name: 'n.webm', url: 'http://x/n.webm', mime_type: 'audio/webm', size: 10 }], created_at: '2026-11-18T10:00:00Z',
      } as Partial<Message>,
    ];
    monter(AGENT, 12);
    await screen.findByText('Message 12');
    expect(screen.queryByTestId('bouton-assistant')).toBeNull();
    expect(chemins().filter((c) => c.includes('/copilote') || c.includes('/transcription'))).toEqual([]);
  });
});

describe('TCK-2977 — « Demander au fil »', () => {
  it('✦ ouvre la feuille ; « Mettre dans le composeur » remplit le champ SANS envoyer', async () => {
    conversation = { ...conversation, copilote: true };
    apiRequest.mockImplementation(async (chemin: string) =>
      chemin.endsWith('/copilote')
        ? { data: { conversation_id: 42, sortes: { resume: { statut: 'aucun' }, question: { statut: 'prete', suggestion_id: 77, proposition: { question: 'Qui paie ?', reponse: 'Le bailleur paie le déplacement.', sources: [{ type: 'message', id: 4 }] } } } } }
        : {},
    );
    monter(AGENT, 2);
    fireEvent.click(await screen.findByTestId('bouton-assistant'));
    const reponse = await screen.findByTestId('reponse-de-l-assistant');
    expect(reponse.textContent).toContain('Réponse de l’assistant');
    expect(screen.getByText('L’assistant ne lit que ce fil et ses objets. La réponse n’est vue que par vous.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre dans le composeur' }));
    await waitFor(() => expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Le bailleur paie le déplacement.'));
    expect(envoyer).not.toHaveBeenCalled();
    expect(chemins().filter((c) => c.endsWith('/messages'))).toEqual([]);
  });
});

describe('TCK-2977 — la forme réelle de `copilote` (TCK-2974)', () => {
  it('un objet `{fonctions}` ouvre le copilote ; `resume` coupé par l’agence : aucune demande, « Désactivé par l’agence »', async () => {
    conversation = { ...conversation, copilote: { fonctions: { resume: { active: false, raison: 'agence' } } } };
    monter(AGENT, 12);
    await screen.findByTestId('bouton-assistant');
    expect((await screen.findByTestId('etat-de-l-assistant')).textContent).toContain('Désactivé par l’agence');
    expect(chemins().filter((c) => c.endsWith('/copilote/resume'))).toEqual([]);
  });

  it('`resume` actif dans l’objet : le résumé est demandé', async () => {
    conversation = { ...conversation, copilote: { fonctions: { resume: { active: true, raison: null } } } };
    monter(AGENT, 10);
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote/resume'));
  });
});

