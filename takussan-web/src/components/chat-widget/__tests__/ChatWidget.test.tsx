/**
 * TCK-274 — Floating chat widget visibility rules:
 *   - hidden when the visitor is anonymous (no `user`)
 *   - hidden on `/auth/*` and `/onboarding/*` routes
 *   - hidden on the maintenance page
 *   - hidden on `/app/messages` (the dedicated inbox is already showing)
 *   - visible everywhere else when authenticated
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  ChatView: () => <div data-testid="chat-view" />,
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
