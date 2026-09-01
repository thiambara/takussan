/**
 * TCK-274 — Deep-link support: when the URL carries `?conversation=ID`,
 * `MessagesPage` opens that conversation immediately. Used by the floating
 * chat widget on mobile (FAB redirect) and from the widget's "Manage group"
 * link when the user wants the full /app/messages experience.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import { MessagesPage } from '../MessagesPage';

const searchParamsGet = vi.fn<(key: string) => string | null>();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsGet }),
}));

vi.mock('../ConversationList', () => ({
  ConversationList: ({ selectedId }: { selectedId: number | null }) => (
    <div data-testid="conv-list">selected={String(selectedId)}</div>
  ),
}));

vi.mock('../ChatView', () => ({
  ChatView: ({
    conversationId,
    onBack,
  }: {
    conversationId: number;
    onBack?: () => void;
  }) => (
    <div data-testid="chat-view">
      chat={conversationId}
      {onBack && (
        <button type="button" data-testid="chat-back-button" onClick={onBack}>
          retour
        </button>
      )}
    </div>
  ),
}));

vi.mock('../NewGroupDialog', () => ({
  NewGroupDialog: () => null,
}));

vi.mock('../PropertyDraftChatView', () => ({
  PropertyDraftChatView: ({
    property,
    onBack,
  }: {
    property: { slug: string };
    onBack?: () => void;
  }) => (
    <div data-testid="chat-draft">
      draft={property.slug}
      {onBack && (
        <button type="button" data-testid="chat-back-button" onClick={onBack}>
          retour
        </button>
      )}
    </div>
  ),
}));

const resolution = vi.fn<() => { data: unknown } | undefined>(() => undefined);
vi.mock('@/lib/queries/conversations', () => ({
  usePropertyConversation: () => ({ data: resolution() }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe('<MessagesPage> deep-link', () => {
  it('opens the conversation given by the ?conversation= query param', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.getByTestId('conv-list')).toHaveTextContent('selected=42');
  });

  it('shows the empty-state when no ?conversation= param is present', () => {
    searchParamsGet.mockImplementation(() => null);
    render(wrap(<MessagesPage />));

    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
    expect(screen.getByText(/Sélectionnez une conversation/)).toBeInTheDocument();
  });

  it('ignores non-numeric ?conversation= values', () => {
    searchParamsGet.mockImplementation((key) =>
      key === 'conversation' ? 'abc' : null,
    );
    render(wrap(<MessagesPage />));

    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });
});

/**
 * TCK-500 — second point d'entrée : `?property=<slug>`, posé par la fiche d'un bien en dessous du
 * point de rupture `md`. Le brouillon n'apparaît QUE si le fil n'existe pas encore : sur un fil
 * déjà ouvert, la page montre l'historique et laisse le champ vide.
 */
describe('<MessagesPage> ?property=', () => {
  const BIEN = {
    id: 1,
    slug: 'villa-almadies',
    title: 'Villa 4 pièces aux Almadies',
    reference_number: 'TK-2451',
    main_photo_url: null,
  };

  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation((key) => (key === 'property' ? 'villa-almadies' : null));
  });

  it('ouvre un fil neuf avec son brouillon quand aucune conversation n’existe', () => {
    resolution.mockReturnValue({
      data: { conversation_id: null, can_message: true, property: BIEN, recipient: null },
    });
    render(wrap(<MessagesPage />));

    expect(screen.getByTestId('chat-draft')).toHaveTextContent('draft=villa-almadies');
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  it('ouvre le fil EXISTANT sans brouillon quand il y en a un', () => {
    resolution.mockReturnValue({
      data: { conversation_id: 77, can_message: true, property: BIEN, recipient: null },
    });
    render(wrap(<MessagesPage />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=77');
    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
  });

  it('ne propose rien quand le visiteur est lui-même le destinataire', () => {
    resolution.mockReturnValue({
      data: { conversation_id: null, can_message: false, property: BIEN, recipient: null },
    });
    render(wrap(<MessagesPage />));

    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });
});

/**
 * TCK-501 — sous le point de rupture `md`, la page montre UNE chose à la fois.
 *
 * ⚠️ Ces tests portent sur ce qui est MONTÉ, pas sur ce qui est visible : le partage est fait en
 * JS et non par un `hidden` Tailwind, précisément parce que les deux panneaux montent chacun un
 * sondage réseau. Un test qui n'assertait que la classe laisserait passer la version qui cache
 * la liste tout en la faisant sonder toutes les 10 s sur un téléphone.
 */
describe('<MessagesPage> sous le point de rupture md (TCK-501)', () => {
  const BIEN = {
    id: 1,
    slug: 'villa-almadies',
    title: 'Villa 4 pièces aux Almadies',
    reference_number: 'TK-2451',
    main_photo_url: null,
  };

  /** `md` vaut 768 px : le gate JS écoute `(max-width: 767px)`, comme la classe `md:`. */
  function largeurDeFenetre(compact: boolean): void {
    window.matchMedia = ((query: string) =>
      ({
        matches: compact && query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }

  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation(() => null);
    largeurDeFenetre(true);
  });

  // AC1 — 390 px, aucune conversation choisie : la liste SEULE, sur toute la largeur.
  it('montre la liste seule quand aucune conversation n’est ouverte', () => {
    render(wrap(<MessagesPage />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
    // L'état vide appartient au panneau de droite : sur téléphone il n'a pas lieu d'être, la
    // liste occupe déjà l'écran entier.
    expect(screen.queryByText(/Sélectionnez une conversation/)).not.toBeInTheDocument();
  });

  // AC2 — une conversation ouverte occupe TOUTE la largeur : la liste n'est plus montée.
  it('montre la conversation seule, sans la liste, quand une conversation est ouverte', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('conv-list')).not.toBeInTheDocument();
  });

  // AC3 — un lien `?conversation=` n'est pas un cul-de-sac.
  it('ramène à la liste depuis une conversation ouverte par ?conversation=', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage />));

    fireEvent.click(screen.getByTestId('chat-back-button'));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  // AC3 — même exigence sur l'autre point d'entrée, celui de TCK-500.
  it('ramène à la liste depuis un brouillon ouvert par ?property=', () => {
    searchParamsGet.mockImplementation((key) => (key === 'property' ? 'villa-almadies' : null));
    resolution.mockReturnValue({
      data: { conversation_id: null, can_message: true, property: BIEN, recipient: null },
    });
    render(wrap(<MessagesPage />));

    expect(screen.queryByTestId('conv-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-back-button'));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
  });

  /**
   * ⚠️ Le retour doit l'emporter sur l'URL, qui, elle, ne bouge pas. La version qui remettait
   * simplement la sélection à `null` rendait la main à `?conversation=42`, qui rouvrait aussitôt
   * la même conversation : le bouton clignotait et la liste ne revenait jamais.
   */
  it('ne rouvre pas la conversation de l’URL après un retour', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    const { rerender } = render(wrap(<MessagesPage />));

    fireEvent.click(screen.getByTestId('chat-back-button'));
    rerender(wrap(<MessagesPage />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  // AC4 — au-dessus du point de rupture, RIEN ne change : les deux panneaux, pas de retour.
  it('garde les deux panneaux côte à côte au-dessus du point de rupture', () => {
    largeurDeFenetre(false);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('chat-back-button')).not.toBeInTheDocument();
  });

  /**
   * AC5 — l'ablation. Deux couches doivent basculer ensemble : retirer `md:grid-cols-…` rendrait
   * une colonne unique à 1440 px, retirer le gate JS remonterait les deux panneaux à 390 px. Le
   * test précédent garde la seconde ; celui-ci garde la première, que le DOM seul ne montre pas.
   */
  it('déclare la grille à deux colonnes à partir de md, et une seule en dessous', () => {
    render(wrap(<MessagesPage />));

    const grille = screen.getByTestId('messagerie-grille');
    expect(grille).toHaveClass('grid-cols-1');
    expect(grille).toHaveClass('md:grid-cols-[320px_1fr]');
    // Contrainte 2 : `100vh` vaut la hauteur barre d'adresse RÉTRACTÉE sur un téléphone.
    expect(grille.className).toContain('h-[calc(100dvh-12rem)]');
    expect(grille.className).not.toContain('100vh');
  });
});
