/**
 * TCK-1764 (P172.04) — l'éligibilité à l'avis n'est pas relue quand `refreshUser()` remplace
 * l'objet `user` par le même compte.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

const actions = vi.hoisted(() => ({
  getReviewEligibility: vi.fn(),
  submitReview: vi.fn(),
  submitReviewReply: vi.fn(),
}));
vi.mock('@/app/actions/property', () => actions);
vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { PropertyReviews } from '../PropertyReviews';

describe('PropertyReviews — même compte (TCK-1764)', () => {
  beforeEach(() => {
    actions.getReviewEligibility.mockReset().mockResolvedValue({ eligible: false, alreadyReviewed: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
          meta: { total: 0, current_page: 1, average: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
        }),
      })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('un nouvel objet pour le même compte ne relit pas l’éligibilité', async () => {
    auth.user = { id: 7, roles: ['customer'], agency_id: null };
    const vue = <PropertyReviews slug="villa" propertyId={1} averageRating={null} reviewsCount={0} />;
    const { rerender } = render(withIntl(vue));
    await vi.waitFor(() => expect(actions.getReviewEligibility).toHaveBeenCalledTimes(1));

    auth.user = { id: 7, roles: ['customer'], agency_id: null };
    rerender(withIntl(<PropertyReviews slug="villa" propertyId={1} averageRating={null} reviewsCount={0} />));
    await new Promise((r) => setTimeout(r, 20));

    expect(actions.getReviewEligibility).toHaveBeenCalledTimes(1);
  });
});
