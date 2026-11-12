/**
 * TCK-274 — Deep-link support: when the URL carries `?conversation=ID`,
 * `MessagesPage` opens that conversation immediately. Used by the floating
 * chat widget on mobile (FAB redirect) and from the widget's "Manage group"
 * link when the user wants the full /app/messages experience.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import type { MyProfilesResponse } from '@/types/profile';
import { MessagesPage } from '../MessagesPage';
import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';

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
    contexte,
    onPlusDActions,
  }: {
    conversationId: number;
    onBack?: () => void;
    contexte?: { ouvert: boolean; onBasculer: () => void };
    onPlusDActions?: () => void;
  }) => (
    <div data-testid="chat-view">
      chat={conversationId}
      {onPlusDActions && (
        <button type="button" data-testid="plus-d-actions" onClick={onPlusDActions}>
          ⋯
        </button>
      )}
      {contexte && (
        <button type="button" data-testid="basculer-le-contexte" onClick={contexte.onBasculer}>
          {contexte.ouvert ? 'replier' : 'afficher'}
        </button>
      )}
      {onBack && (
        <button type="button" data-testid="chat-back-button" onClick={onBack}>
          retour
        </button>
      )}
    </div>
  ),
}));

vi.mock('../NewGroupDialog', () => ({
  NewGroupDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-group-dialog" /> : null,
}));

/**
 * TCK-2632 — « Nouvelle conversation » est remplacé par un double : ses gestes (ouvrir un fil
 * existant, ouvrir un brouillon, « Créer un groupe ») sont ce que la PAGE en fait. Le dialogue
 * lui-même a ses propres tests (`NouvelleConversation.tck-2632.test.tsx`).
 */
vi.mock('../NouvelleConversation', () => ({
  NouvelleConversation: ({
    open,
    onClose,
    onOuvrir,
    onBrouillon,
    onNouveauGroupe,
  }: {
    open: boolean;
    onClose: () => void;
    onOuvrir: (id: number) => void;
    onBrouillon: (p: { id: number; name: string; avatar_url: string | null }) => void;
    onNouveauGroupe?: () => void;
  }) =>
    open ? (
      <div data-testid="nouvelle-conversation">
        {onNouveauGroupe ? (
          <button type="button" onClick={() => { onClose(); onNouveauGroupe(); }}>
            Créer un groupe
          </button>
        ) : null}
        <button type="button" onClick={() => { onClose(); onOuvrir(42); }}>
          fil existant
        </button>
        <button type="button" onClick={() => { onClose(); onBrouillon({ id: 9, name: 'Awa Ndiaye', avatar_url: null }); }}>
          sans fil
        </button>
      </div>
    ) : null,
}));

vi.mock('../BrouillonDirect', () => ({
  BrouillonDirect: ({ personne, onBack }: { personne: { name: string }; onBack?: () => void }) => (
    <div data-testid="brouillon-direct">
      brouillon={personne.name}
      {onBack && (
        <button type="button" data-testid="chat-back-button" onClick={onBack}>
          retour
        </button>
      )}
    </div>
  ),
}));

/**
 * TCK-645 — la réponse de `GET /api/me/profiles`. Par défaut un compte SANS profil (client) : le
 * bouton « Nouveau groupe » lui était proposé avant ce ticket, et il l'est toujours.
 */
const mesProfils = vi.fn<() => { data: MyProfilesResponse | undefined }>(() => ({
  data: { data: [], meta: { active_profile_id: null, count: 0 } },
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => mesProfils(),
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
/** TCK-2632 — la première page de la liste sans filtre : l'arrivée au bureau et le sous-titre la lisent. */
type FilDeListe = { id: number; unread_count?: number };
const listeSansFiltre = vi.fn<() => { data: unknown }>(() => ({ data: undefined }));
function pageDeListe(fils: FilDeListe[], counts = { all: fils.length, unread: fils.filter((f) => (f.unread_count ?? 0) > 0).length, group: 0 }) {
  return { data: { pages: [{ data: fils, meta: { current_page: 1, last_page: 1, counts } }] } };
}
vi.mock('@/lib/queries/conversations', () => ({
  usePropertyConversation: () => ({ data: resolution() }),
  useConversationsInfinite: () => listeSansFiltre(),
}));

vi.mock('../FeuilleDuFil', () => ({
  FeuilleDuFil: ({ conversationId, open }: { conversationId: number; open: boolean }) =>
    open ? <div data-testid="feuille-du-fil">feuille={conversationId}</div> : null,
}));

vi.mock('../ColonneDeContexte', () => ({
  ColonneDeContexte: ({ conversationId, ouverte, onOuvrir }: { conversationId: number; ouverte: boolean; onOuvrir: () => void }) => (
    <div data-testid="colonne-de-contexte" data-ouverte={String(ouverte)}>
      contexte={conversationId}
      {!ouverte && (
        <button type="button" data-testid="rouvrir-le-contexte" onClick={onOuvrir}>
          rouvrir
        </button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  listeSansFiltre.mockReturnValue({ data: undefined });
});

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
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.getByTestId('conv-list')).toHaveTextContent('selected=42');
  });

  it('shows the empty-state when no ?conversation= param is present', () => {
    searchParamsGet.mockImplementation(() => null);
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
    expect(screen.getByText(/Sélectionnez une conversation/)).toBeInTheDocument();
  });

  it('ignores non-numeric ?conversation= values', () => {
    searchParamsGet.mockImplementation((key) =>
      key === 'conversation' ? 'abc' : null,
    );
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

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
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-draft')).toHaveTextContent('draft=villa-almadies');
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  it('ouvre le fil EXISTANT sans brouillon quand il y en a un', () => {
    resolution.mockReturnValue({
      data: { conversation_id: 77, can_message: true, property: BIEN, recipient: null },
    });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=77');
    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
  });

  it('ne propose rien quand le visiteur est lui-même le destinataire', () => {
    resolution.mockReturnValue({
      data: { conversation_id: null, can_message: false, property: BIEN, recipient: null },
    });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });
});

/**
 * TCK-501 — sous le point de rupture, la page montre UNE chose à la fois.
 *
 * ⚠️ Ces tests portent sur ce qui est MONTÉ, pas sur ce qui est visible : le partage est fait en
 * JS et non par un `hidden` Tailwind, précisément parce que les deux panneaux montent chacun un
 * sondage réseau. Un test qui n'assertait que la classe laisserait passer la version qui cache
 * la liste tout en la faisant sonder toutes les 10 s sur un téléphone.
 *
 * TCK-505 (#4) — le point de rupture est `lg` (1024 px), plus `md` (768 px) : entre 768 et 1023
 * la coque montre sa barre latérale de 256 px, et la grille `320px 1fr` laissait ≈ 150 px au
 * fil. La largeur simulée ici est un NOMBRE de pixels, pas un booléen : c'est ce qui permet au
 * cas 768 de rougir si le gate revenait à `(max-width: 767px)`.
 */
describe('<MessagesPage> sous le point de rupture lg (TCK-501, TCK-505)', () => {
  const BIEN = {
    id: 1,
    slug: 'villa-almadies',
    title: 'Villa 4 pièces aux Almadies',
    reference_number: 'TK-2451',
    main_photo_url: null,
  };

  /**
   * Simule un viewport de `largeurPx` : une requête `(max-width: Npx)` correspond ssi
   * `largeurPx <= N`. Le test ne connaît donc pas le seuil du composant — il le SUBIT, comme un
   * navigateur, et c'est le composant qui doit écouter la bonne valeur.
   */
  function largeurDeFenetre(largeurPx: number): void {
    window.matchMedia = ((query: string) => {
      const max = /\(max-width:\s*(\d+)px\)/.exec(query);
      const min = /\(min-width:\s*(\d+)px\)/.exec(query);
      return {
        matches: max !== null ? largeurPx <= Number(max[1]) : min !== null && largeurPx >= Number(min[1]),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  }

  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation(() => null);
    largeurDeFenetre(390);
  });

  // AC1 — 390 px, aucune conversation choisie : la liste SEULE, sur toute la largeur.
  it('montre la liste seule quand aucune conversation n’est ouverte', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
    // L'état vide appartient au panneau de droite : sur téléphone il n'a pas lieu d'être, la
    // liste occupe déjà l'écran entier.
    expect(screen.queryByText(/Sélectionnez une conversation/)).not.toBeInTheDocument();
  });

  // AC2 — une conversation ouverte occupe TOUTE la largeur : la liste n'est plus montée.
  it('montre la conversation seule, sans la liste, quand une conversation est ouverte', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('conv-list')).not.toBeInTheDocument();
  });

  // TCK-2481 — sous `md`, la barre d'onglets prend le bas du `<main>` : le cadre s'en retire, sans
  // quoi le composeur passe sous le pli. Dès `md`, pas de barre : la hauteur ne bouge pas.
  it('cadre (liste) : moins la barre sous md, inchangé dès md', () => {
    searchParamsGet.mockImplementation(() => null);
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    const classes = screen.getByTestId('messagerie').className.split(/\s+/);
    expect(classes.find((c) => c.startsWith('h-[calc('))).toContain('var(--barre-onglets-hauteur)');
    expect(classes.find((c) => c.startsWith('md:h-[calc('))).not.toContain('barre-onglets');
  });

  // TCK-2617 — une conversation ouverte est déclarée à la coque, qui n'y rend ni son en-tête ni sa barre
  // d'onglets au téléphone : le cadre prend tout l'écran (`h-dvh`), il ne retire plus rien.
  it('cadre (conversation) : tout l’écran sous md, inchangé dès md', () => {
    searchParamsGet.mockImplementation((cle: string) => (cle === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    const classes = screen.getByTestId('messagerie').className.split(/\s+/);
    expect(classes).toContain('h-dvh');
    expect(classes.find((c) => c.startsWith('h-[calc('))).toBeUndefined();
    expect(classes.find((c) => c.startsWith('md:h-[calc('))).not.toContain('barre-onglets');
  });

  // AC3 — un lien `?conversation=` n'est pas un cul-de-sac.
  it('ramène à la liste depuis une conversation ouverte par ?conversation=', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

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
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

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
    const { rerender } = render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    fireEvent.click(screen.getByTestId('chat-back-button'));
    rerender(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  // AC4 — au-dessus du point de rupture, RIEN ne change : les deux panneaux, pas de retour.
  it('garde les deux panneaux côte à côte au-dessus du point de rupture', () => {
    largeurDeFenetre(1440);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('chat-back-button')).not.toBeInTheDocument();
  });

  /**
   * TCK-505 AC2 — à 768 px, UN seul panneau. C'est la largeur où l'ancien gate `(max-width:
   * 767px)` ne correspondait plus : les deux panneaux montaient, et la grille `md:[320px_1fr]`
   * laissait ≈ 150 px au fil derrière une barre latérale de 256 px. À 1024, les deux panneaux
   * reviennent, comme avant.
   */
  it.each([768, 1023])('montre la conversation seule à %i px (tablette en portrait)', (largeur) => {
    largeurDeFenetre(largeur);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('conv-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-back-button')).toBeInTheDocument();
  });

  it('remonte les deux panneaux dès 1024 px', () => {
    largeurDeFenetre(1024);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('chat-back-button')).not.toBeInTheDocument();
  });

  /**
   * AC5 (TCK-501) — l'ablation. Deux couches doivent basculer ensemble : retirer
   * `lg:grid-cols-…` rendrait une colonne unique à 1440 px, retirer le gate JS remonterait les
   * deux panneaux à 390 px. Les tests précédents gardent la seconde ; celui-ci garde la
   * première, que le DOM seul ne montre pas.
   *
   * TCK-505 — la classe est `lg:`, et l'ancienne `md:` doit être ABSENTE : un
   * `md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr]` passerait un `toContain('lg:…')` seul
   * tout en rouvrant deux colonnes à 768 px, là où le JS n'en remplit qu'une.
   */
  it('déclare les colonnes à partir de lg, et une seule en dessous', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    const grille = screen.getByTestId('messagerie-grille');
    expect(grille).toHaveClass('grid-cols-1');
    // TCK-2632 — au bureau, des colonnes en flex (liste · fil · contexte), et pas avant `lg`.
    expect(grille).toHaveClass('lg:flex');
    expect(grille.className).not.toMatch(/\bmd:(grid-cols-|flex\b)/);
    // La liste : 340 px (94,4 pas de 3,6 px) dès `lg`, réduite avec la largeur dès `xl` ; sa
    // bordure suit le même seuil.
    const liste = screen.getByRole('complementary');
    expect(liste).toHaveClass('lg:border-r', 'lg:w-[calc(var(--spacing)*94.4)]', 'xl:w-[min(calc(var(--spacing)*94.4),29.3%)]');
    expect(liste.className).not.toMatch(/\bmd:(border-r|w-)/);
    // Contrainte 2 : `100vh` vaut la hauteur barre d'adresse RÉTRACTÉE sur un téléphone. Le cadre
    // de la page porte la hauteur à toute largeur — au bureau, l'écran entier (`lg:h-dvh`, sans
    // en-tête de coque dès `md`) — et la grille le remplit.
    expect(grille).toHaveClass('flex-1');
    const cadre = screen.getByTestId('messagerie');
    expect(cadre).toHaveClass('lg:h-dvh', 'lg:-my-8');
    expect(cadre.className).toMatch(/(^|\s)h-\[calc\(100dvh-[^\]]+\)\]/);
    expect(cadre.className + grille.className).not.toContain('100vh');
  });

  /**
   * Revue design 2026-09-16 — la rangée implicite d'une grille prend la hauteur de son contenu :
   * mesuré à 1366 avec 22 conversations, la liste ne défilait plus (scrollHeight = clientHeight)
   * et le composeur tombait sous le `overflow-hidden`. La rangée est bornée, et les deux
   * panneaux acceptent de rétrécir sous leur contenu. jsdom ne calcule aucune hauteur : c'est la
   * déclaration qui est gardée, la mesure est dans `docs/qa/revue-design-2026-09-16/`.
   */
  it('borne la rangée de la grille pour que la liste et le fil défilent', () => {
    largeurDeFenetre(1440);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('messagerie-grille')).toHaveClass('grid-rows-[minmax(0,1fr)]');
    expect(screen.getByRole('complementary')).toHaveClass('min-h-0');
    expect(screen.getByTestId('chat-view').closest('section')).toHaveClass('min-h-0');
  });
});


/**
 * TCK-645 — « Nouveau groupe » n'est pas proposé dans une agence `individual` (décision du porteur
 * du 2026-10-14 : masquage côté front SEULEMENT, l'API garde sa règle de TCK-565).
 *
 * TCK-2632 — l'entrée de la page est désormais « Nouvelle conversation » (deux boutons dans le DOM :
 * l'en-tête compact, entre `md` et `lg`, et la barre de la liste, au-dessus ; sous `md`, l'action
 * de l'en-tête de la coque). « Créer un groupe » y est une ligne, et c'est elle que la règle de
 * TCK-645 gouverne désormais : présente en agence standard et sans agence, absente sinon.
 */
describe('<MessagesPage> « Nouvelle conversation » et le groupe selon l’agence (TCK-645, TCK-2632)', () => {
  function profilActif(kind: 'standard' | 'individual' | null): MyProfilesResponse {
    return {
      data: [
        {
          id: 'agency_admin:5',
          type: 'agency_admin',
          numeric_id: 5,
          agency_id: 12,
          agency: { id: 12, name: 'Espace', slug: 'espace', kind },
          status: 'active',
          created_at: null,
        },
      ],
      meta: { active_profile_id: 'agency_admin:5', count: 1 },
    };
  }

  function ligneDeGroupe(): HTMLElement | null {
    fireEvent.click(screen.getByTestId('nouvelle-conversation-bureau'));
    return screen.queryByRole('button', { name: 'Créer un groupe' });
  }

  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation(() => null);
  });

  // AC1
  it('ne propose pas le groupe en agence individuelle', () => {
    mesProfils.mockReturnValue({ data: profilActif('individual') });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(ligneDeGroupe()).toBeNull();
    // « Nouvelle conversation » reste : une conversation à une personne n'est pas un groupe.
    expect(screen.getByTestId('nouvelle-conversation')).toBeInTheDocument();
  });

  // AC2 — présent, et il ouvre la création, depuis chacun des deux boutons.
  it.each(['nouvelle-conversation-bureau', 'nouvelle-conversation-compact'])(
    'propose le groupe en agence standard, qui ouvre la création (%s)',
    (testId) => {
      mesProfils.mockReturnValue({ data: profilActif('standard') });
      render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

      fireEvent.click(screen.getByTestId(testId));
      expect(screen.queryByTestId('new-group-dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Créer un groupe' }));
      expect(screen.getByTestId('new-group-dialog')).toBeInTheDocument();
      expect(screen.queryByTestId('nouvelle-conversation')).not.toBeInTheDocument();
    },
  );

  // Fail-closed : tant que le `kind` n'est pas lu, le groupe n'est pas proposé.
  it.each([
    ['profils pas encore chargés', undefined],
    ['kind illisible', 'kind-null'],
  ] as const)('ne propose pas le groupe quand %s', (_cas, etat) => {
    mesProfils.mockReturnValue({ data: etat === undefined ? undefined : profilActif(null) });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(ligneDeGroupe()).toBeNull();
  });

  // Inchangé pour un compte sans agence : il voyait le groupe avant ce ticket.
  it('propose toujours le groupe à un compte sans profil', () => {
    mesProfils.mockReturnValue({ data: { data: [], meta: { active_profile_id: null, count: 0 } } });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(ligneDeGroupe()).not.toBeNull();
  });

  /**
   * Le serveur ne connaît jamais `GET /api/me/profiles`. TCK-645 avait payé un écart d'hydratation
   * sur le bouton de groupe, qui dépendait des profils. Les boutons de la page n'en dépendent plus
   * (« Nouvelle conversation » est proposée à tous) : le HTML serveur et le premier rendu client
   * portent les mêmes, et la règle des profils ne joue plus que dans le dialogue, monté plus tard.
   */
  it("l'hydratation ne signale aucun écart quand les profils sont déjà en cache au navigateur", async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recuperees: unknown[] = [];
    const page = () => wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />);

    mesProfils.mockReturnValue({ data: undefined });
    const conteneur = document.createElement('div');
    conteneur.innerHTML = renderToString(page());
    document.body.appendChild(conteneur);
    expect(conteneur.querySelector('[data-testid="nouvelle-conversation-compact"]')).not.toBeNull();

    mesProfils.mockReturnValue({ data: profilActif('standard') });
    let racine: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      racine = hydrateRoot(conteneur, page(), { onRecoverableError: (e) => recuperees.push(e) });
    });

    expect(recuperees).toEqual([]);
    expect(erreurs.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    expect(conteneur.querySelector('[data-testid="nouvelle-conversation-bureau"]')).not.toBeNull();

    act(() => racine?.unmount());
    conteneur.remove();
    erreurs.mockRestore();
  });
});

/**
 * TCK-2632 (AC4) — ce que la page fait du choix d'une personne : son fil s'il existe, sinon un
 * brouillon, qu'un choix dans la liste ou le retour referment.
 */
describe('<MessagesPage> une personne choisie dans « Nouvelle conversation » (TCK-2632)', () => {
  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation(() => null);
    mesProfils.mockReturnValue({ data: { data: [], meta: { active_profile_id: null, count: 0 } } });
  });

  it('un fil existant s’ouvre', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    fireEvent.click(screen.getByTestId('nouvelle-conversation-bureau'));
    fireEvent.click(screen.getByRole('button', { name: 'fil existant' }));
    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
    expect(screen.queryByTestId('brouillon-direct')).not.toBeInTheDocument();
  });

  it('sans fil, le brouillon s’ouvre ; choisir un fil ensuite le referme', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    fireEvent.click(screen.getByTestId('nouvelle-conversation-bureau'));
    fireEvent.click(screen.getByRole('button', { name: 'sans fil' }));
    expect(screen.getByTestId('brouillon-direct')).toHaveTextContent('brouillon=Awa Ndiaye');
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nouvelle-conversation-bureau'));
    fireEvent.click(screen.getByRole('button', { name: 'fil existant' }));
    expect(screen.queryByTestId('brouillon-direct')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
  });
});

/**
 * TCK-645 AC3 — à 390 px, la liste occupe la largeur de l'écran, sans carte encadrée imbriquée.
 *
 * jsdom ne calcule aucune mise en page : ce qui est gardé ici est la DÉCLARATION — le cadre arrondi
 * et bordé n'existe qu'à partir de `lg`, la page déborde la gouttière de la coque en dessous, et
 * l'en-tête compact remplace l'empilement titre / sous-titre / barre « Conversations ». La mesure au
 * navigateur (360, 390, 1366) est rendue à la session principale.
 */
describe('<MessagesPage> mise en page mobile (TCK-645)', () => {
  function largeurDeFenetre(largeurPx: number): void {
    window.matchMedia = ((query: string) => {
      const max = /\(max-width:\s*(\d+)px\)/.exec(query);
      const min = /\(min-width:\s*(\d+)px\)/.exec(query);
      return {
        matches: max !== null ? largeurPx <= Number(max[1]) : min !== null && largeurPx >= Number(min[1]),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  }

  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation(() => null);
    mesProfils.mockReturnValue({ data: { data: [], meta: { active_profile_id: null, count: 0 } } });
    largeurDeFenetre(390);
  });

  /** Les classes SANS préfixe de point de rupture : ce qui s'applique à 390 px. */
  function classesDeBase(el: HTMLElement): string[] {
    return el.className.split(/\s+/).filter((c) => c && !c.includes(':'));
  }

  /**
   * TCK-2632 (fidélité, maquette `app-messagerie` a/0) — au téléphone, l'en-tête de la coque dit
   * « Messages », le nom de l'onglet, et porte « Nouvelle conversation » en bouton plein ; la liste
   * commence sous lui, sans la marge haute de l'enveloppe (le champ à 12 px du filet).
   */
  it('au téléphone : « Messages » en titre, l’action pleine, la liste sans marge haute', () => {
    let declaration: ReturnType<typeof useDeclarationDEnTete> | null = null;
    function Sonde() {
      declaration = useDeclarationDEnTete();
      return null;
    }
    render(
      wrap(
        <FournisseurDEnTete>
          <Sonde />
          <MessagesPage titre="Messagerie" sousTitre="Vos conversations" />
        </FournisseurDEnTete>,
      ),
    );
    expect(declaration!.titre).toBe('Messages');
    render(wrap(<>{declaration!.action}</>));
    expect(screen.getByRole('button', { name: 'Nouvelle conversation' })).toHaveClass('bg-primary');
    const cadre = screen.getByTestId('messagerie');
    expect(classesDeBase(cadre)).toContain('-my-6');
    expect(cadre).toHaveClass('md:mt-0');
  });

  it('ne pose ni bordure complète ni arrondi sur la grille en dessous de lg', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    const base = classesDeBase(screen.getByTestId('messagerie-grille'));
    expect(base).not.toContain('border');
    expect(base.some((c) => c.startsWith('rounded'))).toBe(false);
    // TCK-2632 — ni au-dessus : la messagerie du bureau n'est plus une carte, elle occupe l'écran.
    const grille = screen.getByTestId('messagerie-grille');
    expect(grille.className).not.toMatch(/(^|\s)lg:(rounded\S*|border)(\s|$)/);
    expect(grille).toHaveClass('lg:border-t-0');
  });

  it('déborde la gouttière horizontale de la coque en dessous de lg, et seulement là', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    const cadre = screen.getByTestId('messagerie');
    // Couplé à `px-4 md:px-6` du `<main>` d'AppShell — cf. le commentaire du composant.
    // TCK-2632 — dès `lg`, il déborde aussi la marge de bureau (`lg:px-8`) : la messagerie occupe
    // toute la zone de contenu.
    expect(cadre).toHaveClass('-mx-4', 'md:-mx-6', 'lg:-mx-8');
  });

  it('remplace l’empilement titre / sous-titre / barre par un en-tête compact', () => {
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    const compact = screen.getByTestId('messagerie-entete-compact');
    expect(compact).toHaveClass('lg:hidden');
    expect(compact).toHaveTextContent('Messagerie');
    expect(compact).not.toHaveTextContent('Vos conversations');
    // L'en-tête de bureau (en tête de la colonne de liste) ne s'affiche qu'à partir de lg ; la barre
    // « Conversations » n'existe plus (TCK-2632 : un seul titre).
    expect(screen.getByTestId('messagerie-entete-bureau')).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByTestId('messagerie-barre-liste')).not.toBeInTheDocument();
  });

  it('retire l’en-tête compact quand une conversation occupe l’écran', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
    expect(screen.queryByTestId('messagerie-entete-compact')).not.toBeInTheDocument();
  });

  it('au bureau, UN titre en tête de la liste, avec le compte des fils (TCK-2632)', () => {
    largeurDeFenetre(1440);
    listeSansFiltre.mockReturnValue(pageDeListe([{ id: 1 }], { all: 10, unread: 2, group: 3 }));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    const bureau = screen.getByTestId('messagerie-entete-bureau');
    expect(bureau).toHaveTextContent('Messagerie');
    expect(bureau).toHaveTextContent('2 non lues · 10 conversations');
  });

  it('le sous-titre de la page tient la place tant que la liste n’est pas arrivée', () => {
    largeurDeFenetre(1440);
    listeSansFiltre.mockReturnValue({ data: undefined });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('messagerie-entete-bureau')).toHaveTextContent('Vos conversations');
  });
});

/**
 * TCK-2632 (AC5) — au bureau, l'arrivée ouvre le fil non lu le plus récent au lieu d'un panneau
 * vide, et la colonne de contexte se replie depuis l'en-tête du fil.
 */
describe('<MessagesPage> l’arrivée au bureau et le contexte (TCK-2632)', () => {
  function largeurDeFenetre(largeurPx: number): void {
    window.matchMedia = ((query: string) => {
      const max = /\(max-width:\s*(\d+)px\)/.exec(query);
      const min = /\(min-width:\s*(\d+)px\)/.exec(query);
      return {
        matches: max !== null ? largeurPx <= Number(max[1]) : min !== null && largeurPx >= Number(min[1]),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  }

  const FILS = [{ id: 7, unread_count: 0 }, { id: 9, unread_count: 2 }, { id: 11, unread_count: 1 }];

  beforeEach(() => {
    resolution.mockReturnValue(undefined);
    searchParamsGet.mockImplementation(() => null);
    largeurDeFenetre(1280);
  });

  it('ouvre le fil non lu le plus récent', () => {
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=9');
    expect(screen.getByTestId('conv-list')).toHaveTextContent('selected=9');
  });

  it('à défaut de non lu, ouvre le plus récent', () => {
    listeSansFiltre.mockReturnValue(pageDeListe([{ id: 7 }, { id: 8 }]));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=7');
  });

  it('ne change pas de fil quand la liste se relit (verrou)', () => {
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    const { rerender } = render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    // Ouvrir le fil 9 l'a marqué lu ; la relecture rend le 11 comme « non lu le plus récent ».
    listeSansFiltre.mockReturnValue(pageDeListe([{ id: 9, unread_count: 0 }, { id: 11, unread_count: 1 }]));
    rerender(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=9');
  });

  /**
   * À l'hydratation, `(max-width: …)` vaut `false` jusqu'à la mesure du navigateur : un verrou posé
   * sur « pas compact » ouvrirait un fil — et le marquerait lu — sur un téléphone dont la liste est
   * déjà en cache. Le verrou se pose sur « au bureau », qui vaut `false` au même moment.
   */
  it('n’ouvre rien au téléphone pendant l’hydratation, liste déjà en cache', async () => {
    largeurDeFenetre(390);
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    const page = () => wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />);
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const conteneur = document.createElement('div');
    conteneur.innerHTML = renderToString(page());
    document.body.appendChild(conteneur);
    let racine: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        racine = hydrateRoot(conteneur, page(), { onRecoverableError: () => {} });
      });

      expect(conteneur.querySelector('[data-testid="chat-view"]')).toBeNull();
      expect(conteneur.querySelector('[data-testid="conv-list"]')?.textContent).toContain('selected=null');
    } finally {
      act(() => racine?.unmount());
      conteneur.remove();
      erreurs.mockRestore();
    }
  });

  it('n’ouvre rien au téléphone, même liste en cache', () => {
    largeurDeFenetre(390);
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('conv-list')).toHaveTextContent('selected=null');
  });

  it('ne passe pas devant ?conversation=', () => {
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
  });

  it('ne passe pas devant ?property= encore en résolution', () => {
    searchParamsGet.mockImplementation((key) => (key === 'property' ? 'villa-almadies' : null));
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    const { rerender } = render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();

    resolution.mockReturnValue({
      data: {
        conversation_id: 42,
        can_message: true,
        property: { id: 1, slug: 'villa-almadies', title: 'Villa', reference_number: 'TK-1', main_photo_url: null },
        recipient: null,
      },
    });
    rerender(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat=42');
  });

  it('la colonne de contexte suit le fil ouvert, et se replie depuis son en-tête', () => {
    listeSansFiltre.mockReturnValue(pageDeListe(FILS));
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));

    const colonne = screen.getByTestId('colonne-de-contexte');
    expect(colonne).toHaveTextContent('contexte=9');
    expect(colonne).toHaveAttribute('data-ouverte', 'true');

    fireEvent.click(screen.getByTestId('basculer-le-contexte'));
    expect(screen.getByTestId('colonne-de-contexte')).toHaveAttribute('data-ouverte', 'false');
    expect(screen.getByTestId('basculer-le-contexte')).toHaveTextContent('afficher');

    fireEvent.click(screen.getByTestId('rouvrir-le-contexte'));
    expect(screen.getByTestId('colonne-de-contexte')).toHaveAttribute('data-ouverte', 'true');
  });

  it('pas de colonne de contexte au téléphone, ni sur un brouillon', () => {
    largeurDeFenetre(390);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    const { unmount } = render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    expect(screen.queryByTestId('colonne-de-contexte')).not.toBeInTheDocument();
    expect(screen.queryByTestId('basculer-le-contexte')).not.toBeInTheDocument();
    unmount();

    largeurDeFenetre(1280);
    searchParamsGet.mockImplementation((key) => (key === 'property' ? 'villa-almadies' : null));
    resolution.mockReturnValue({
      data: {
        conversation_id: null,
        can_message: true,
        property: { id: 1, slug: 'villa-almadies', title: 'Villa', reference_number: 'TK-1', main_photo_url: null },
        recipient: null,
      },
    });
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    expect(screen.queryByTestId('colonne-de-contexte')).not.toBeInTheDocument();
  });

  it('au téléphone, « ⋯ » du fil ouvre la feuille du fil (maquette a/2) ; au bureau, aucun rappel', () => {
    largeurDeFenetre(390);
    searchParamsGet.mockImplementation((key) => (key === 'conversation' ? '42' : null));
    const { unmount } = render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    expect(screen.queryByTestId('feuille-du-fil')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('plus-d-actions'));
    expect(screen.getByTestId('feuille-du-fil')).toHaveTextContent('feuille=42');
    unmount();

    largeurDeFenetre(1280);
    render(wrap(<MessagesPage titre="Messagerie" sousTitre="Vos conversations" />));
    expect(screen.queryByTestId('plus-d-actions')).not.toBeInTheDocument();
  });
});
