/**
 * TCK-274 — Floating chat widget visibility rules:
 *   - hidden when the visitor is anonymous (no `user`)
 *   - hidden on `/auth/*` and `/onboarding/*` routes
 *   - hidden on the maintenance page
 *   - hidden on `/app/messages` (the dedicated inbox is already showing)
 *   - visible everywhere else when authenticated
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
