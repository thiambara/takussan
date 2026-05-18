/**
 * TCK-274 — Deep-link support: when the URL carries `?conversation=ID`,
 * `MessagesPage` opens that conversation immediately. Used by the floating
 * chat widget on mobile (FAB redirect) and from the widget's "Manage group"
 * link when the user wants the full /app/messages experience.
 */
import { describe, expect, it, vi } from 'vitest';
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
