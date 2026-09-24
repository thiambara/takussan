/**
 * TCK-274 — Floating chat widget visibility rules:
 *   - hidden when the visitor is anonymous (no `user`)
 *   - hidden on `/auth/*` and `/onboarding/*` routes
 *   - hidden on the maintenance page
 *   - hidden on `/app/messages` (the dedicated inbox is already showing)
 *   - visible everywhere else when authenticated
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import { ChatWidget } from '../ChatWidget';

const usePathnameMock = vi.fn<() => string>();
const useAuthMock = vi.fn<() => { user: { id: number } | null }>();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../useUnreadCount', () => ({
  useUnreadCount: () => 0,
}));

vi.mock('@/components/messages/ConversationList', () => ({
  ConversationList: () => <div data-testid="conv-list" />,
}));

vi.mock('@/components/messages/ChatView', () => ({
  ChatView: ({ onBack }: { onBack?: () => void }) => (
    <div data-testid="chat-view">
      <button type="button" onClick={onBack}>
        retour-chat
      </button>
    </div>
  ),
}));

vi.mock('@/components/messages/PropertyDraftChatView', () => ({
  PropertyDraftChatView: ({ onBack }: { onBack?: () => void }) => (
    <div data-testid="chat-draft">
      <button type="button" onClick={onBack}>
        retour-brouillon
      </button>
    </div>
  ),
}));

const cibleMock = vi.fn<() => unknown>(() => null);
const consommerCible = vi.fn();
vi.mock('@/context/ChatDraftContext', () => ({
  useChatDraft: () => ({
    cible: cibleMock(),
    ouvrirChatBien: vi.fn(),
    consommerCible: () => {
      consommerCible();
      cibleMock.mockReturnValue(null);
    },
  }),
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

describe('<ChatWidget> visibility', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/');
    useAuthMock.mockReturnValue({ user: { id: 1 } });
  });

  it('renders nothing when the user is anonymous', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = render(wrap(<ChatWidget />));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on /auth/* routes', () => {
    usePathnameMock.mockReturnValue('/auth/login');
    const { container } = render(wrap(<ChatWidget />));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on /onboarding/* routes', () => {
    usePathnameMock.mockReturnValue('/onboarding/agent');
    const { container } = render(wrap(<ChatWidget />));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on /maintenance', () => {
    usePathnameMock.mockReturnValue('/maintenance');
    const { container } = render(wrap(<ChatWidget />));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on /app/messages itself (avoid duplicate UI)', () => {
    usePathnameMock.mockReturnValue('/app/messages');
    const { container } = render(wrap(<ChatWidget />));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the launcher on the home page when authenticated', () => {
    usePathnameMock.mockReturnValue('/');
    render(wrap(<ChatWidget />));
    expect(screen.getByTestId('chat-widget-launcher')).toBeInTheDocument();
  });

  it('renders the launcher on a property page when authenticated', () => {
    usePathnameMock.mockReturnValue('/properties/villa-saly');
    render(wrap(<ChatWidget />));
    expect(screen.getByTestId('chat-widget-launcher')).toBeInTheDocument();
  });

  it('renders the launcher on /app dashboard pages when authenticated', () => {
    usePathnameMock.mockReturnValue('/app/properties');
    render(wrap(<ChatWidget />));
    expect(screen.getByTestId('chat-widget-launcher')).toBeInTheDocument();
  });
});

/**
 * TCK-500 — le panneau ouvert par une fiche de bien.
 *
 * Le cas qui a été cassé une fois : `open` reste `false` quand c'est la CIBLE qui tient le
 * panneau ouvert. Un « retour » qui se contentait de consommer la cible faisait donc disparaître
 * le panneau entier, sur un bouton qui promet de reculer d'un cran.
 */
describe('<ChatWidget> ouvert depuis une fiche de bien', () => {
  const BIEN = {
    id: 1,
    slug: 'villa-almadies',
    title: 'Villa 4 pièces aux Almadies',
    reference_number: 'TK-2451',
    main_photo_url: null,
  };

  beforeEach(() => {
    usePathnameMock.mockReturnValue('/properties/villa-almadies');
    useAuthMock.mockReturnValue({ user: { id: 1 } });
    consommerCible.mockReset();
    cibleMock.mockReturnValue(null);
  });

  it('ouvre le panneau sur le brouillon sans que le lanceur ait été cliqué', () => {
    cibleMock.mockReturnValue({
      conversation_id: null,
      can_message: true,
      property: BIEN,
      recipient: null,
    });
    render(wrap(<ChatWidget />));

    expect(screen.getByTestId('chat-widget-panel')).toBeInTheDocument();
    expect(screen.getByTestId('chat-draft')).toBeInTheDocument();
  });

  it('ouvre le fil EXISTANT plutôt que le brouillon quand il y en a un', () => {
    cibleMock.mockReturnValue({
      conversation_id: 55,
      can_message: true,
      property: BIEN,
      recipient: null,
    });
    render(wrap(<ChatWidget />));

    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
  });

  it('« retour » revient à la liste et NE referme PAS le panneau', () => {
    cibleMock.mockReturnValue({
      conversation_id: null,
      can_message: true,
      property: BIEN,
      recipient: null,
    });
    render(wrap(<ChatWidget />));

    fireEvent.click(screen.getByRole('button', { name: 'retour-brouillon' }));

    expect(screen.getByTestId('chat-widget-panel')).toBeInTheDocument();
    expect(screen.getByTestId('conv-list')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-draft')).not.toBeInTheDocument();
  });
});

/**
 * TCK-565 — retour testeur du 2026-09-23 (M15) : « Il me fait penser à un assistant de service
 * clientèle. » Le rond à bulle unique n'avait AUCUN texte visible : son nom n'existait que dans
 * l'`aria-label`, donc pour les seuls lecteurs d'écran. Il ouvre la messagerie de l'utilisateur,
 * et doit le dire à l'écran.
 */
/**
 * Une classe Tailwind qui rend un élément invisible ou sans largeur, préfixes de point de rupture
 * compris (`max-sm:hidden`) — `null` s'il n'y en a pas.
 */
function classeQuiCache(element: HTMLElement): string | null {
  const QUI_CACHE =
    /^(?:hidden|sr-only|invisible|collapse|opacity-0|text-transparent|scale-0|w-0|max-w-0|size-0|h-0|max-h-0|text-\[0(?:px)?\])$/;
  return (
    element.className
      .split(/\s+/)
      .filter(Boolean)
      .find((jeton) => QUI_CACHE.test(jeton.split(':').at(-1) ?? jeton)) ?? null
  );
}

/**
 * Réparation 2 (réserve du vérificateur) : `classeQuiCache` est une liste NOIRE, et deux
 * contournements la laissaient verte — un `style={{ display: 'none' }}` en ligne, et un libellé en
 * `text-[1px] text-primary`, c'est-à-dire illisible et de la couleur du fond de la pilule. Entre
 * le libellé et le lanceur, on n'admet donc plus que des jetons TYPOGRAPHIQUES nommés (taille de
 * l'échelle, graisse, interlignage, troncature) : ni couleur — le libellé HÉRITE celle du lanceur,
 * que le test fixe à la paire `bg-primary` / `text-primary-foreground` —, ni taille arbitraire,
 * ni style en ligne. Tout autre jeton est refusé et devra être ajouté ici en connaissance de cause.
 */
const JETONS_DE_LIBELLE: RegExp[] = [
  /^text-(?:xs|sm|base|lg)$/,
  /^font-(?:medium|semibold|bold)$/,
  /^leading-(?:none|tight|snug|normal)$/,
  /^(?:truncate|whitespace-nowrap)$/,
];

function jetonHorsLibelle(element: HTMLElement): string | null {
  const style = element.getAttribute('style');
  if (style && style.trim() !== '') return `style="${style}"`;
  return (
    element.className
      .split(/\s+/)
      .filter(Boolean)
      .find((jeton) => !JETONS_DE_LIBELLE.some((motif) => motif.test(jeton))) ?? null
  );
}

/**
 * Passe finale (vérificateur, passe 3, réserve D3) : les deux contrôles ci-dessus ne regardent que
 * les nœuds situés ENTRE le libellé et le lanceur. Or le libellé HÉRITE sa taille, sa couleur, son
 * interlignage et son opacité du lanceur : une taille de police nulle posée sur le lanceur lui-même
 * éteignait le libellé et rendait la pastille à icône seule de la capture du testeur — le test
 * restait vert (8 mutations de cette famille, toutes vertes, rejouées le 2026-09-23).
 *
 * Le lanceur porte légitimement des dizaines de jetons de mise en page ; on ne les liste pas. On
 * contrôle les seules FAMILLES qui se transmettent au texte ou l'effacent, et chacune n'admet
 * qu'une liste blanche. Les variantes (`hover:`, `active:`, `md:`…) sont retirées avant l'examen :
 * un effacement conditionnel reste un effacement, sauf `md:hidden`, par lequel le bouton mobile
 * cède la place au lanceur de bureau.
 */
const FAMILLES_HERITEES: Array<[RegExp, RegExp]> = [
  // taille et couleur du texte : l'échelle nommée, et la seule couleur prévue pour ce fond
  [/^text-/, /^text-(?:xs|sm|base|lg|primary-foreground)$/],
  [/^font-/, /^font-(?:medium|semibold|bold)$/],
  [/^leading-/, /^leading-(?:none|tight|snug|normal)$/],
  // aucune de ces familles n'a d'usage sur un lanceur qui doit se lire
  [/^(?:opacity|indent|tracking|blur|brightness)-/, /$^/],
  [/^(?:invisible|sr-only|collapse|contents)$/, /$^/],
  // une réduction à l'appui ou à l'ouverture, jamais un écrasement
  [/^scale-/, /^scale-(?:9[5-9]|100|\[(?:0\.9\d+|1(?:\.\d+)?)\])$/],
];

function jetonDuLanceurQuiEteintLeLibelle(lanceur: HTMLElement): string | null {
  const style = lanceur.getAttribute('style') ?? '';
  // Le bouton mobile se place par `bottom` en ligne (créneau du FloatingDock) : rien d'autre.
  const proprietes = style.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);
  const intruse = proprietes.find((p) => p !== 'bottom');
  if (intruse) return `style: ${intruse}`;

  for (const jeton of lanceur.className.split(/\s+/).filter(Boolean)) {
    // Une propriété CSS arbitraire (crochets contenant « nom: valeur ») échappe à toute famille.
    if (/\[[a-z-]+:/.test(jeton)) return jeton;
    const variantes = jeton.split(':');
    const base = variantes.pop() ?? jeton;
    if (base === 'hidden') {
      if (variantes.join(':') !== 'md') return jeton;
      continue;
    }
    const famille = FAMILLES_HERITEES.find(([motif]) => motif.test(base));
    if (famille && !famille[1].test(base)) return jeton;
  }
  return null;
}

describe('<ChatWidget> dit ce qu’il ouvre (M15)', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/properties');
    useAuthMock.mockReturnValue({ user: { id: 1 } });
    cibleMock.mockReturnValue(null);
  });

  it.each([
    ['le bouton flottant mobile', 'chat-widget-mobile-fab'],
    ['le lanceur de bureau', 'chat-widget-launcher'],
  ])('%s porte le libellé VISIBLE « Messagerie »', (_nom, testId) => {
    render(wrap(<ChatWidget />));
    const lanceur = screen.getByTestId(testId);

    const libelle = within(lanceur).getByText('Messagerie');
    // Visible : ni retiré de l'arbre d'accessibilité…
    expect(libelle.closest('[aria-hidden="true"]')).toBeNull();
    // …ni masqué par une classe, sur le libellé ou entre lui et le lanceur. jsdom ne charge
    // aucune CSS : on ne peut pas y mesurer une largeur, on refuse donc les classes qui cachent.
    // La première version ne refusait que `sr-only` — le libellé passé en `hidden`, ou écrasé
    // par `max-w-0 overflow-hidden`, la laissait verte (relevé du vérificateur, 2026-09-23).
    for (let noeud: HTMLElement | null = libelle; noeud && noeud !== lanceur; noeud = noeud.parentElement) {
      expect(classeQuiCache(noeud), noeud.outerHTML).toBeNull();
      expect(jetonHorsLibelle(noeud), noeud.outerHTML).toBeNull();
    }
    // `toBeVisible` attrape ce que les classes ne disent pas : `display: none` ou `visibility`
    // posés en ligne, l'attribut `hidden`, un ancêtre transparent.
    expect(libelle).toBeVisible();
    // Et le libellé se lit : il hérite la couleur de premier plan PRÉVUE pour ce fond.
    expect(lanceur).toHaveClass('bg-primary', 'text-primary-foreground');
    // …et rien, sur le lanceur lui-même, ne l'éteint par héritage (taille, couleur concurrente,
    // interlignage, opacité, propriété arbitraire).
    expect(jetonDuLanceurQuiEteintLeLibelle(lanceur), lanceur.className).toBeNull();
    // Le lanceur lui-même ne rogne pas son contenu : c'est ainsi qu'un libellé disparaîtrait
    // derrière une pastille de largeur fixe.
    expect(lanceur).not.toHaveClass('overflow-hidden');
    expect(lanceur.className).not.toMatch(/(?:^|\s)(?:size|w|max-w)-(?:\d|\[)/);
  });

  it('le nom accessible CONTIENT le libellé visible (WCAG 2.5.3)', () => {
    render(wrap(<ChatWidget />));

    for (const testId of ['chat-widget-mobile-fab', 'chat-widget-launcher']) {
      const nom = screen.getByTestId(testId).getAttribute('aria-label') ?? '';
      expect(nom.toLowerCase()).toContain('messagerie');
    }
  });

  it('le bouton mobile mène à la messagerie pleine page', () => {
    render(wrap(<ChatWidget />));
    expect(screen.getByTestId('chat-widget-mobile-fab')).toHaveAttribute('href', '/app/messages');
  });
});
