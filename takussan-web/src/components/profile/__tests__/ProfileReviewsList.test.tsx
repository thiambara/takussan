import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileReviewsList } from '../ProfileReviewsList';
import { withIntl } from '@/test/intl';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const emptyPage = {
  data: [],
  meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
};

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ProfileReviewsList roles={['customer']} />
    </QueryClientProvider>,
  ));
}

function mockFetch({
  reviews,
  bookings = [],
}: {
  reviews: unknown[];
  bookings?: unknown[];
}) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.includes('/api/reviews')
      ? {
          ...emptyPage,
          data: reviews,
          meta: { ...emptyPage.meta, total: reviews.length },
        }
      : url.includes('/api/bookings')
        ? {
            ...emptyPage,
            data: bookings,
            meta: { ...emptyPage.meta, total: bookings.length },
          }
        : emptyPage;

    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  });

  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<ProfileReviewsList>', () => {
  it('lists reviews posted by the current user before review opportunities', async () => {
    const fetchSpy = mockFetch({
      reviews: [
        {
          id: 42,
          reviewable_type: 'App\\Models\\Property',
          reviewable_id: 7,
          target: {
            type: 'property',
            id: 7,
            title: 'Appartement F2 à Ouakam',
            slug: 'appartement-f2-ouakam',
            subtitle: 'TK-TEST-236',
          },
          author_id: 1,
          author: { id: 1, name: 'Aïssa Diop', avatar_url: null },
          rating: 4,
          title: 'Très bon séjour',
          content: 'Appartement propre et bien situé.',
          is_approved: true,
          status: 'approved',
          reported_count: 0,
          reply_content: null,
          replied_at: null,
          created_at: '2026-05-07T10:00:00Z',
        },
      ],
      bookings: [
        {
          id: 9,
          status: 'completed',
          end_date: '2026-05-01',
          completion_date: null,
          created_at: '2026-04-01T00:00:00Z',
          property: { slug: 'villa-ngor', title: 'Villa Ngor' },
        },
      ],
    });

    renderList();

    await waitFor(() =>
      expect(screen.getByText('Appartement F2 à Ouakam')).toBeInTheDocument(),
    );

    expect(screen.getByText('Très bon séjour')).toBeInTheDocument();
    expect(screen.getByText('Appartement propre et bien situé.')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByText('Approuvé')).toBeInTheDocument();
    expect(screen.getByText(/TK-TEST-236/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Avis à laisser' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Laisser un avis/i })).toHaveAttribute(
      'href',
      '/properties/villa-ngor#avis',
    );

    const reviewRequest = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/reviews'));
    expect(String(reviewRequest?.[0])).toContain('filter%5Bauthor_id%5D=me');
  });

  it('shows a localized empty state when the user has not posted reviews', async () => {
    mockFetch({ reviews: [] });

    renderList();

    await waitFor(() =>
      expect(screen.getByText("Vous n'avez pas encore publié d'avis.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Aucun séjour ni bail ouvert à évaluer pour l'instant.")).toBeInTheDocument();
  });
});
