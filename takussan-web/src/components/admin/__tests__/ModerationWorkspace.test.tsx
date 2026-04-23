import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { ModerationWorkspace } from '../ModerationWorkspace';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockFetchQueue = vi.fn();
const mockFetchReports = vi.fn();
const mockModerate = vi.fn();

vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: (...args: unknown[]) => mockFetchQueue(...args),
  fetchReviewReports: (...args: unknown[]) => mockFetchReports(...args),
  moderateReview: (...args: unknown[]) => mockModerate(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <NextIntlClientProvider locale="fr" messages={{}}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function makeReview(overrides: Partial<{
  id: number;
  rating: number;
  title: string;
  content: string;
  status: string;
  reported_count: number;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    rating: overrides.rating ?? 4,
    title: overrides.title ?? 'Bel avis',
    content: overrides.content ?? 'Contenu de test',
    author: { id: 10, name: 'John Doe', avatar_url: null },
    reviewable_type: 'App\\Models\\Property',
    reviewable_id: 99,
    status: overrides.status ?? 'pending',
    is_approved: false,
    reported_count: overrides.reported_count ?? 0,
    created_at: '2025-01-01T00:00:00Z',
  };
}

describe('<ModerationWorkspace>', () => {
  beforeEach(() => {
    mockFetchQueue.mockReset();
    mockFetchReports.mockReset();
    mockModerate.mockReset();
    mockFetchReports.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
  });

  it('renders the queue list and auto-selects the first review', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [
        makeReview({ id: 1, title: 'Premier avis' }),
        makeReview({ id: 2, title: 'Second avis', status: 'reported', reported_count: 3 }),
      ],
      meta: { total: 2, current_page: 1, last_page: 1, per_page: 20, pending_count: 2 },
      links: { first: null, last: null, prev: null, next: null },
    });

    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-1');
    expect(screen.getByTestId('moderation-queue-item-1')).toHaveTextContent('Premier avis');
    expect(screen.getByTestId('moderation-queue-item-2')).toHaveTextContent('Second avis');
    // The detail panel shows the first review.
    expect(screen.getByTestId('moderation-detail')).toHaveTextContent('Premier avis');
  });

  it('triggers approve decision without requiring a reason', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [makeReview({ id: 1 })],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20, pending_count: 1 },
      links: { first: null, last: null, prev: null, next: null },
    });
    mockModerate.mockResolvedValue({ data: makeReview({ id: 1 }) });

    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-detail');

    await user.click(screen.getByRole('button', { name: /^approuver$/i }));

    await waitFor(() => expect(mockModerate).toHaveBeenCalled());
    expect(mockModerate).toHaveBeenCalledWith(
      1,
      { decision: 'approve', reason: undefined },
      'fake-token',
    );
  });

  it('requires a reason for a delete decision', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [makeReview({ id: 7 })],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20, pending_count: 1 },
      links: { first: null, last: null, prev: null, next: null },
    });

    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-detail');
    await user.click(screen.getByRole('button', { name: /supprimer/i }));

    // Confirmation pane visible
    expect(await screen.findByTestId('moderation-confirm')).toBeInTheDocument();

    // Confirm without reason triggers validation message, no mutation call
    await user.click(screen.getByRole('button', { name: /confirmer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/raison est requise/i);
    expect(mockModerate).not.toHaveBeenCalled();

    // Provide reason and confirm
    await user.type(screen.getByLabelText(/raison/i), 'contenu offensant');
    await user.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() => expect(mockModerate).toHaveBeenCalled());
    expect(mockModerate).toHaveBeenCalledWith(
      7,
      { decision: 'delete', reason: 'contenu offensant' },
      'fake-token',
    );
  });
});
