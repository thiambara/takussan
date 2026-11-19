/**
 * TCK-2968 (ADR-0128 § 6) — la note d'équipe et les @mentions dans le composeur de `ChatView` :
 *  - le personnel a l'interrupteur « Équipe » ; un client ne l'a jamais, ni aucun mot d'équipe ;
 *  - en mode « Équipe », écrire n'émet AUCUN message éphémère « en train d'écrire » (ADR-0129 § 2) ;
 *  - la destination revient à « Fil » après chaque envoi, et ne passe pas d'un fil à l'autre ;
 *  - les mentionnables d'une note ne comptent que le personnel ; une mention part en identifiant, s'affiche
 *    en nom.
 * Sur le faux Echo et le vrai `TempsReelProvider`, comme `ChatView.en-direct.tck-2955`.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import type { Conversation, ConversationContext, Message } from '@/types/message';
import { instances, reinitialiser, type FauxEcho } from '@/lib/temps-reel/__tests__/faux-echo';

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
const PRESENCE = 'presence-sujet.conversation.7';

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

async function connexionTenue(): Promise<FauxEcho> {
  await waitFor(() => expect(instances).toHaveLength(1));
  const echo = instances[0]!;
  act(() => echo.statut('connected'));
  await waitFor(() => expect(echo.canaux.has(PRESENCE)).toBe(true));
  return echo;
}

const champ = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const interrupteur = () => screen.getByRole('switch', { name: 'Équipe' });

function taper(valeur: string) {
  const el = champ();
  fireEvent.change(el, { target: { value: valeur, selectionStart: valeur.length, selectionEnd: valeur.length } });
}

beforeEach(() => {
  reinitialiser();
  envoyer.mockReset();
  envoyer.mockResolvedValue({ data: {} });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_chemin: string, options: { body?: { channel_name?: string } }) => ({
    auth: `cle-dev:signature-${options.body?.channel_name}`,
  }));
  // Une salle d'intervention : l'agent, sa collègue, le locataire et la plombière.
  conversation = {
    id: 7,
    type: 'group',
    maintenance_request_id: 12,
    participants: [participant(7, 'Sokhna Sène'), participant(8, 'Awa Diop'), participant(9, 'Ousmane Ndiaye'), participant(10, 'Astou Sy')],
  } as unknown as Partial<Conversation>;
  // Les drapeaux de l'API (TCK-2967) : l'agent écrit des notes ; lui et sa collègue les lisent.
  contexte = {
    team_note_reader_ids: [7, 8],
      can_write_team_note: true,
    participants: [
      { user_id: 7, relation: 'agent', reads_team_notes: true },
      { user_id: 8, relation: 'agent', reads_team_notes: true },
      { user_id: 9, relation: 'locataire', reads_team_notes: false },
      { user_id: 10, relation: 'prestataire', reads_team_notes: false },
    ],
  };
  messages = [{ id: 500, conversation_id: 7, sender_id: 9, content: 'Bonjour', type: 'text', attachments: [], created_at: '2026-11-18T09:00:00Z' }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  delete window.__TAKUSSAN_CONFIG__;
  vi.unstubAllGlobals();
});

describe('l’interrupteur « Équipe »', () => {
  it('le personnel l’a ; la destination se lit à la ligne, au champ et au bouton', async () => {
    monter();
    expect(screen.getByTestId('lu-par')).toHaveTextContent('Lu par Awa Diop (agent), Ousmane Ndiaye (locataire) et Astou Sy (prestataire)');
    expect(interrupteur()).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(interrupteur());

    expect(interrupteur()).toHaveAttribute('aria-checked', 'true');
    expect(champ()).toHaveAttribute('placeholder', 'Note d’équipe…');
    expect(champ()).toHaveAttribute('data-destination', 'equipe');
    expect(screen.getByTestId('lu-par')).toHaveTextContent('Lu par l’équipe seulement — pas par Ousmane ou Astou');
    expect(screen.getByTestId('bouton-noter')).toHaveTextContent('Noter');
  });

  it('un client ne voit ni l’interrupteur, ni aucun mot d’équipe', async () => {
    // Pour qui ne lit pas les notes, l'API rend `can_write_team_note` faux et tous les `reads_team_notes` faux.
    contexte = {
      team_note_reader_ids: [],
      can_write_team_note: false,
      participants: [
        { user_id: 7, relation: 'agent', reads_team_notes: false },
        { user_id: 9, relation: 'locataire', reads_team_notes: false },
      ],
    };
    const { container } = monter(LOCATAIRE);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/équipe|note d’équipe/i);
    expect(screen.getByTestId('lu-par')).toHaveTextContent('Lu par Sokhna Sène (agent)');
  });

  it('l’interrupteur suit `can_write_team_note` : un personnel aussi bailleur du fil l’a quand l’API le dit', async () => {
    // Sa relation est « propriétaire » (`RelationsAuFil::ORDRE`) : seule l'API dit qu'il écrit des notes ici.
    contexte = {
      team_note_reader_ids: [7, 8],
      can_write_team_note: true,
      participants: [
        { user_id: 7, relation: 'proprietaire', reads_team_notes: true },
        { user_id: 8, relation: 'agent', reads_team_notes: true },
      ],
    };
    monter();
    expect(interrupteur()).toBeInTheDocument();
  });

  it('un agent dont l’API dit qu’il n’écrit pas de note n’a pas l’interrupteur ; contexte non lu non plus', async () => {
    contexte = { team_note_reader_ids: [], can_write_team_note: false, participants: [{ user_id: 7, relation: 'agent', reads_team_notes: false }] };
    const { unmount } = monter();
    expect(screen.queryByRole('switch')).toBeNull();
    unmount();
    contexte = undefined;
    monter();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('aucun « en train d’écrire » en mode « Équipe » (ADR-0129 § 2)', () => {
  it('écrire une note n’émet rien ; écrire au fil émet', async () => {
    monter();
    const echo = await connexionTenue();

    fireEvent.click(interrupteur());
    taper('O');
    taper('Ou');
    expect(echo.canaux.get(PRESENCE)!.chuchotements).toEqual([]);

    fireEvent.click(interrupteur());
    taper('Ous');
    expect(echo.canaux.get(PRESENCE)!.chuchotements).toEqual([{ evenement: 'ecrit', charge: {} }]);
  });
});

describe('la destination revient à « Fil »', () => {
  it('après l’envoi d’une note : `visibility=team` part, puis l’interrupteur est rendu à « Fil »', async () => {
    monter();
    fireEvent.click(interrupteur());
    taper('Ousmane a déjà eu une fuite en juin');
    fireEvent.click(screen.getByTestId('bouton-noter'));

    await waitFor(() => expect(envoyer).toHaveBeenCalledWith({ content: 'Ousmane a déjà eu une fuite en juin', visibility: 'team' }));
    await waitFor(() => expect(interrupteur()).toHaveAttribute('aria-checked', 'false'));
    expect(champ()).toHaveAttribute('placeholder', 'Écrivez un message…');
  });

  it('un échec garde « Équipe » : le nouvel essai reste une note', async () => {
    envoyer.mockRejectedValueOnce(new Error('refus'));
    monter();
    fireEvent.click(interrupteur());
    taper('À surveiller');
    fireEvent.click(screen.getByTestId('bouton-noter'));
    await waitFor(() => expect(envoyer).toHaveBeenCalledTimes(1));
    expect(interrupteur()).toHaveAttribute('aria-checked', 'true');
  });

  it('un message au fil ne porte pas de `visibility`', async () => {
    monter();
    taper('Bonjour à tous');
    fireEvent.submit(champ().closest('form')!);
    await waitFor(() => expect(envoyer).toHaveBeenCalledWith({ content: 'Bonjour à tous' }));
  });

  it('changer de fil rend « Fil » : la destination ne se retient pas d’un fil à l’autre', async () => {
    const { rerender } = monter();
    fireEvent.click(interrupteur());
    expect(interrupteur()).toHaveAttribute('aria-checked', 'true');

    conversation = { ...conversation, id: 8 };
    rerender(arbre(AGENT, 8));
    expect(interrupteur()).toHaveAttribute('aria-checked', 'false');
    expect(champ()).toHaveAttribute('placeholder', 'Écrivez un message…');

    rerender(arbre(AGENT, 7));
    expect(interrupteur()).toHaveAttribute('aria-checked', 'false');
  });
});

describe('@mentions', () => {
  it('les mentionnables d’une note ne comptent que le personnel ; au fil, tous les participants', async () => {
    monter();
    fireEvent.click(interrupteur());
    taper('Merci @');
    let liste = screen.getByRole('listbox', { name: 'Personnes à mentionner' });
    expect(within(liste).getAllByRole('option').map((o) => o.textContent?.replace(/^[A-Z]{2}/, ''))).toEqual(['Awa DiopAgent']);

    fireEvent.click(interrupteur());
    taper('Merci @');
    liste = screen.getByRole('listbox', { name: 'Personnes à mentionner' });
    expect(within(liste).getAllByRole('option').map((o) => o.textContent?.replace(/^[A-Z]{2}/, ''))).toEqual([
      'Astou SyPrestataire',
      'Awa DiopAgent',
      'Ousmane NdiayeLocataire',
    ]);
  });

  it('les mentionnables d’une note suivent `team_note_reader_ids`, pas la relation', async () => {
    // La plombière lit les notes selon l'API, la collègue « agent » non : c'est l'API qui tranche.
    contexte = {
      team_note_reader_ids: [7, 10],
      can_write_team_note: true,
      participants: [
        { user_id: 7, relation: 'agent', reads_team_notes: true },
        { user_id: 8, relation: 'agent', reads_team_notes: false },
        { user_id: 9, relation: 'locataire', reads_team_notes: false },
        { user_id: 10, relation: 'prestataire', reads_team_notes: true },
      ],
    };
    monter();
    fireEvent.click(interrupteur());
    taper('Merci @');
    const liste = screen.getByRole('listbox', { name: 'Personnes à mentionner' });
    expect(within(liste).getAllByRole('option').map((o) => o.textContent?.replace(/^[A-Z]{2}/, ''))).toEqual(['Astou SyPrestataire']);
  });

  it('un lecteur des notes SANS ligne de relation reste mentionnable dans une note (`team_note_reader_ids`)', async () => {
    // Awa n'a aucune ligne dans `participants[]` (aucune relation lisible) : seule la liste de l'API la dit lectrice.
    contexte = {
      team_note_reader_ids: [7, 8],
      can_write_team_note: true,
      participants: [
        { user_id: 7, relation: 'agent', reads_team_notes: true },
        { user_id: 9, relation: 'locataire', reads_team_notes: false },
      ],
    };
    monter();
    fireEvent.click(interrupteur());
    taper('Merci @');
    const liste = screen.getByRole('listbox', { name: 'Personnes à mentionner' });
    expect(within(liste).getAllByRole('option').map((o) => o.textContent?.replace(/^[A-Z]{2}/, ''))).toEqual(['Awa Diop']);
  });

  it('choisir une mention écrit `@Nom` et envoie l’identifiant ; une mention effacée ne part pas', async () => {
    monter();
    fireEvent.click(interrupteur());
    taper('Merci @Aw');
    fireEvent.mouseDown(screen.getByRole('option', { name: /Awa Diop/ }));
    expect(champ().value).toBe('Merci @Awa Diop ');

    fireEvent.click(screen.getByTestId('bouton-noter'));
    await waitFor(() => expect(envoyer).toHaveBeenCalledWith({ content: 'Merci @Awa Diop', visibility: 'team', mentions: [8] }));
  });

  it('Entrée choisit la mention active au lieu d’envoyer', async () => {
    monter();
    taper('@ou');
    fireEvent.keyDown(champ(), { key: 'Enter' });
    expect(champ().value).toBe('@Ousmane Ndiaye ');
    expect(envoyer).not.toHaveBeenCalled();
  });
});

describe('la note et la mention dans le fil', () => {
  it('une note se lit au premier regard ; la mention s’affiche en nom, jamais en identifiant', async () => {
    messages = [
      {
        id: 501,
        conversation_id: 7,
        sender_id: 8,
        sender: { id: 8, full_name: 'Awa Diop' },
        content: '@Sokhna Sène devis approuvé',
        type: 'text',
        visibility: 'team',
        metadata: { mentions: [7] },
        attachments: [],
        created_at: '2026-11-18T11:52:00Z',
      },
    ];
    monter();
    const note = screen.getByTestId('note-d-equipe');
    expect(note).toHaveTextContent('Note d’équipe · Awa Diop');
    expect(note).toHaveTextContent('Invisible pour Ousmane et Astou');
    expect(within(note).getByTestId('mention')).toHaveTextContent('@Sokhna Sène');
    expect(note.textContent).not.toContain('7');
  });
});
