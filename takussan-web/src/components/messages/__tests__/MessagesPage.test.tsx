/**
 * TCK-274 — Deep-link support: when the URL carries `?conversation=ID`,
 * `MessagesPage` opens that conversation immediately. Used by the floating
 * chat widget on mobile (FAB redirect) and from the widget's "Manage group"
 * link when the user wants the full /app/messages experience.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  ChatView: ({ conversationId }: { conversationId: number }) => (
    <div data-testid="chat-view">chat={conversationId}</div>
  ),
}));

vi.mock('../NewGroupDialog', () => ({
  NewGroupDialog: () => null,
}));

vi.mock('../PropertyDraftChatView', () => ({
  PropertyDraftChatView: ({ property }: { property: { slug: string } }) => (
    <div data-testid="chat-draft">draft={property.slug}</div>
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
