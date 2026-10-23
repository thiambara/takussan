import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyReviewsResponse } from '@/types/review';

/**
 * TCK-1781 (piste P175.05) — l'API rend `author.name` nul pour un auteur effacé ou sans nom, et
 * ne rend plus « Anonyme » en dur, en français (principe 5) : la fiche écrit le repli dans la
 * langue du lecteur, et ne lit plus `name.charAt(0)` sur une valeur nulle.
 */

const REPONSE: PropertyReviewsResponse = {
  data: [
    {
      id: 1,
      rating: 4,
      title: null,
      content: 'Très bon séjour.',
      author: { id: 9, name: null, avatar_url: null },
      reply_content: null,
      replied_at: null,
      created_at: '2026-10-01T10:00:00Z',
    },
  ],
  meta: { total: 1, current_page: 1, average: 4, distribution: { 5: 0, 4: 1, 3: 0, 2: 0, 1: 0 } },
};

vi.mock('@/hooks/usePropertyReviews', () => ({
  usePropertyReviews: () => ({
    data: REPONSE,
    loading: false,
    error: null,
    submit: vi.fn(),
    reply: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/app/actions/property', () => ({ getReviewEligibility: vi.fn() }));
vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { PropertyReviews } from '../PropertyReviews';

function rendre(locale: 'fr' | 'en') {
  return render(
    withIntl(
      <PropertyReviews slug="villa" propertyId={1} averageRating={4} reviewsCount={1} />,
      locale,
    ),
  );
}

describe('<PropertyReviews> — auteur sans nom (TCK-1781)', () => {
  it('écrit « Anonyme » en français', () => {
    rendre('fr');
    expect(screen.getByText('Anonyme')).toBeInTheDocument();
  });

  it('écrit « Anonymous » en anglais', () => {
    rendre('en');
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
  });
});
