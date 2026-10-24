import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ModerationReview } from '@/lib/queries/reviews-moderation';
import { withIntl } from '@/test/intl';
import { ModerationDetail } from '../ModerationDetail';

/**
 * P193.05 (TCK-2053) — « Anonyme » seulement sans `user_id` : un signalement anonyme n'est plus
 * attribué à un « Utilisateur », et un compte connu est nommé par ce que l'API rend.
 */
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchReviewReports: vi.fn(() => Promise.resolve({
    data: [
      { user_id: null, user: null, reason: 'Spam', reported_at: null },
      { user_id: 5, user: { id: 5, name: '+221770000195', email: null }, reason: 'Faux', reported_at: null },
    ],
    meta: { total: 2 },
  })),
  moderateReview: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const AVIS = {
  id: 1,
  rating: 4,
  title: 'Bel avis',
  content: 'Contenu de test',
  author: { id: 10, name: 'John Doe', avatar_url: null },
  reviewable_type: 'App\\Models\\Property',
  reviewable_id: 99,
  status: 'reported',
  is_approved: false,
  reported_count: 2,
  created_at: '2025-01-01T00:00:00Z',
  can_moderate: true,
} as unknown as ModerationReview;

describe('<ModerationDetail> — signaleurs', () => {
  it('un signalement sans compte est « Anonyme », un compte connu garde son nom', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <ModerationDetail review={AVIS} onModerated={vi.fn()} platform />
      </QueryClientProvider>,
    ));

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Anonyme');
    expect(items[0]).not.toHaveTextContent('Utilisateur');
    expect(items[1]).toHaveTextContent('+221770000195');
  });
});
