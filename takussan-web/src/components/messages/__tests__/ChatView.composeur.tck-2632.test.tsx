/**
 * TCK-2632 — le composeur du fil : la photo ou le PDF part sur la route du texte avec sa légende,
 * le refus de taille se dit AVANT l'envoi (un PDF de 11 Mo), les réponses rapides sont celles du
 * personnel d'agence et n'existent pas pour un client (AC6) ; dans la bulle, la photo est une
 * vignette et le PDF une carte (AC7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ChatView } from '../ChatView';

let roles: string[] = ['agent'];
let type: 'direct' | 'group' = 'direct';
let messages: unknown[] = [];
const envoyerPiece = vi.fn();
const envoyerTexte = vi.fn();

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles }, token: 't' }) }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type, participants: [] } } }),
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
  useSendMessage: () => ({ mutateAsync: envoyerTexte, isPending: false }),
  useSendAttachment: () => ({ mutateAsync: envoyerPiece, isPending: false }),
  useConversationContext: () => ({ data: undefined }),
  useConsignerGesteDuClient: () => ({ mutate: vi.fn() }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
// Le micro : ce que le composeur lui demande (masqué au repos ou non), et un geste qui le dit actif.
vi.mock('../VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: ({ auRepos, onActif }: { auRepos?: string; onActif?: (a: boolean) => void }) => (
    <span data-testid="micro" data-au-repos={auRepos ?? 'visible'}>
      <button type="button" onClick={() => onActif?.(true)}>
        enregistrer
      </button>
    </span>
  ),
}));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

const MO = 1024 * 1024;
const fichier = (nom: string, mime: string, octets: number) => {
  const f = new File(['x'], nom, { type: mime });
  Object.defineProperty(f, 'size', { value: octets });
  return f;
};
const monter = () => render(withIntl(<ChatView conversationId={7} />));
const choisir = (testid: string, f: File) =>
  act(async () => {
    fireEvent.change(screen.getByTestId(testid), { target: { files: [f] } });
  });

beforeEach(() => {
  roles = ['agent'];
  type = 'direct';
  messages = [];
  envoyerPiece.mockReset().mockResolvedValue({ data: {} });
  envoyerTexte.mockReset().mockResolvedValue({ data: {} });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:apercu'), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

describe('<ChatView> — la pièce jointe (TCK-2632)', () => {
  it('un PDF de 11 Mo est refusé avant l’envoi, et rien ne part', async () => {
    monter();
    await choisir('champ-pdf', fichier('bail.pdf', 'application/pdf', 11 * MO));
    expect(screen.getByRole('alert')).toHaveTextContent('Ce PDF dépasse 10 Mo');
    expect(screen.queryByText('bail.pdf')).not.toBeInTheDocument();
    // Rien à envoyer : le micro reste, l'envoi n'est pas proposé.
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument();
    expect(screen.getByTestId('micro')).toHaveAttribute('data-au-repos', 'visible');
    expect(envoyerPiece).not.toHaveBeenCalled();
  });

  it('un PDF accepté s’affiche au-dessus du champ, puis part avec sa légende', async () => {
    monter();
    const pdf = fichier('etat-des-lieux.pdf', 'application/pdf', 2.4 * MO);
    await choisir('champ-pdf', pdf);
    expect(screen.getByText('etat-des-lieux.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Document PDF · 2,4 Mo/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Écrivez un message…'), { target: { value: 'Le voici' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    });
    expect(envoyerPiece).toHaveBeenCalledWith({ file: pdf, type: 'document', content: 'Le voici' });
    expect(envoyerTexte).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('etat-des-lieux.pdf')).not.toBeInTheDocument());
  });

  it('une photo part SANS légende : le schéma du texte seul ne la bloque pas', async () => {
    monter();
    const photo = fichier('salon.jpg', 'image/jpeg', 2 * MO);
    await choisir('champ-photo', photo);
    await waitFor(() => expect(screen.getByText('salon.jpg')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    });
    expect(envoyerPiece).toHaveBeenCalledWith({ file: photo, type: 'image', content: '' });
  });

  it('« Retirer » rend le composeur au texte', async () => {
    monter();
    await choisir('champ-pdf', fichier('bail.pdf', 'application/pdf', MO));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer bail.pdf' }));
    expect(screen.queryByText('bail.pdf')).not.toBeInTheDocument();
  });
});

describe('<ChatView> — le micro devient « envoyer » (TCK-2632)', () => {
  it('champ vide : le micro, sans envoi ; un texte : l’envoi, le micro s’efface sans se démonter', () => {
    monter();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument();
    expect(screen.getByTestId('micro')).toHaveAttribute('data-au-repos', 'visible');

    fireEvent.change(screen.getByPlaceholderText('Écrivez un message…'), { target: { value: 'Bonjour' } });
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
    expect(screen.getByTestId('micro')).toHaveAttribute('data-au-repos', 'masque');

    // Des espaces seuls ne sont pas un message.
    fireEvent.change(screen.getByPlaceholderText('Écrivez un message…'), { target: { value: '   ' } });
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument();
  });

  it('une pièce choisie se propose à l’envoi, même sans texte', async () => {
    monter();
    await choisir('champ-pdf', fichier('etat-des-lieux.pdf', 'application/pdf', 2 * MO));
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('pendant une note vocale, le champ et le trombone s’effacent devant elle', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: 'enregistrer' }));
    expect(screen.getByPlaceholderText('Écrivez un message…')).toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: /Joindre une photo/ })).not.toBeInTheDocument();
  });
});

describe('<ChatView> — les réponses rapides (TCK-2632)', () => {
  it('l’agent les voit dans un fil à deux ; la puce insère la phrase sans rien envoyer', () => {
    monter();
    const champ = screen.getByPlaceholderText('Écrivez un message…') as HTMLTextAreaElement;
    fireEvent.change(champ, { target: { value: 'Bonjour M. Seck,' } });
    fireEvent.click(screen.getByRole('button', { name: 'Toujours disponible' }));
    expect(champ.value).toBe('Bonjour M. Seck, Le bien est toujours disponible.');
    expect(envoyerTexte).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Réponses rapides' }).querySelectorAll('button')).toHaveLength(4);
  });

  it('AC6 — un client ne les voit pas', () => {
    roles = ['customer'];
    monter();
    expect(screen.queryByRole('group', { name: 'Réponses rapides' })).not.toBeInTheDocument();
  });

  it('ni dans un groupe de travail', () => {
    type = 'group';
    monter();
    expect(screen.queryByRole('group', { name: 'Réponses rapides' })).not.toBeInTheDocument();
  });
});

describe('<ChatView> — la pièce dans la bulle (TCK-2632, AC7)', () => {
  const message = (id: number, t: string, content: string, attachments: unknown[]) => ({
    id,
    conversation_id: 7,
    sender_id: 2,
    type: t,
    content,
    attachments,
    created_at: '2026-11-12T10:00:00Z',
    updated_at: '2026-11-12T10:00:00Z',
    sender: { id: 2, full_name: 'Malick Seck' },
  });

  /**
   * Une photo se charge après le saut en bas du fil : sa hauteur arrive tard, et la plus récente
   * restait coupée sous le composeur (mesuré à 390). Le fil reste en bas quand son contenu grandit,
   * sauf si la personne est remontée lire l'historique.
   */
  it('le fil reste en bas quand une photo se charge — pas quand on lit l’historique', () => {
    let grandir: (() => void) | undefined;
    const observes: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(rappel: () => void) {
          grandir = rappel;
        }
        observe(cible: Element) {
          observes.push(cible);
        }
        disconnect() {}
      },
    );
    messages = [message(1, 'image', '', [{ id: 9, name: 'salon.jpg', mime_type: 'image/jpeg', size: 1000, url: 'https://api/o.jpg', thumbnail_url: 'https://api/v.jpg' }])];
    monter();
    const liste = screen.getByRole('img', { name: 'Ouvrir la photo' }).closest('ul.space-y-2')!;
    const fil = liste.parentElement!;
    // C'est le CONTENU du fil qui est observé : c'est lui qui grandit quand une photo arrive.
    expect(observes).toContain(liste);
    let hauteur = 1000;
    Object.defineProperty(fil, 'scrollHeight', { configurable: true, get: () => hauteur });
    Object.defineProperty(fil, 'clientHeight', { configurable: true, value: 400 });

    hauteur = 1200;
    act(() => grandir?.());
    expect(fil.scrollTop).toBe(1200);

    // La personne remonte : la croissance suivante ne la déplace plus.
    fil.scrollTop = 100;
    fireEvent.scroll(fil);
    hauteur = 1500;
    act(() => grandir?.());
    expect(fil.scrollTop).toBe(100);
  });

  it('une photo sans légende : la vignette, et aucun paragraphe vide', () => {
    messages = [message(1, 'image', '', [{ id: 9, name: 'salon.jpg', mime_type: 'image/jpeg', size: 1000, url: 'https://api/o.jpg', thumbnail_url: 'https://api/v.jpg' }])];
    const { container } = monter();
    const img = screen.getByRole('img', { name: 'Ouvrir la photo' });
    expect(img).toHaveAttribute('src', 'https://api/v.jpg');
    expect(img.closest('a')).toHaveAttribute('href', 'https://api/o.jpg');
    const bulle = img.closest('li')!.parentElement!.closest('li')!;
    expect([...bulle.querySelectorAll('p')].filter((p) => p.textContent === '')).toHaveLength(0);
    expect(container.querySelector('img[src="https://api/o.jpg"]')).toBeNull();
  });

  it('sans vignette encore produite, la photo retombe sur l’original', () => {
    messages = [message(1, 'image', 'La cuisine', [{ id: 9, name: 'c.jpg', mime_type: 'image/jpeg', size: 1, url: 'https://api/o.jpg', thumbnail_url: null }])];
    monter();
    expect(screen.getByRole('img', { name: 'Ouvrir la photo' })).toHaveAttribute('src', 'https://api/o.jpg');
    expect(screen.getByText('La cuisine')).toBeInTheDocument();
  });

  it('un PDF est une carte : son nom et son poids', () => {
    messages = [message(1, 'document', '', [{ id: 9, name: 'bail-signe.pdf', mime_type: 'application/pdf', size: 2.4 * MO, url: 'https://api/b.pdf', thumbnail_url: null }])];
    monter();
    const lien = screen.getByRole('link', { name: /bail-signe\.pdf/ });
    expect(lien).toHaveAttribute('href', 'https://api/b.pdf');
    expect(lien).toHaveTextContent('PDF · 2,4 Mo');
  });
});

describe('<ChatView> — l’auteur de la bulle (TCK-2632, « auteur dans un groupe »)', () => {
  const recu = {
    id: 40,
    conversation_id: 7,
    sender_id: 2,
    type: 'text',
    content: 'Et le prix est-il négociable ?',
    attachments: [],
    created_at: '2026-11-12T10:00:00Z',
    updated_at: '2026-11-12T10:00:00Z',
    sender: { id: 2, full_name: 'Malick Seck' },
  };

  it('fil direct : l’en-tête nomme la personne, la bulle ne la répète pas', () => {
    messages = [recu];
    monter();
    expect(screen.getByText('Et le prix est-il négociable ?')).toBeInTheDocument();
    expect(screen.queryByText('Malick Seck')).not.toBeInTheDocument();
  });

  it('groupe : chaque bulle reçue dit son auteur', () => {
    type = 'group';
    messages = [recu];
    monter();
    expect(screen.getByText('Malick Seck')).toBeInTheDocument();
  });
});
