/**
 * TCK-1483 (P103.07) — les avis ne sont demandés qu'à l'approche de leur section.
 *
 * Lu le 2026-10-21 : `usePropertyReviews` les demandait au montage, en bas de fiche, à chaque
 * visite. Décision du porteur : à l'approche de la section seulement.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/app/actions/property', () => ({
  getReviewEligibility: vi.fn(),
  submitReview: vi.fn(),
  submitReviewReply: vi.fn(),
}));
vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { PropertyReviews } from '../PropertyReviews';

type Rappel = (entrees: Array<{ isIntersecting: boolean }>) => void;
const observateurs: Array<{ rappel: Rappel; options?: IntersectionObserverInit }> = [];

describe('PropertyReviews — à l’approche de la section (TCK-1483)', () => {
  let reseau: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observateurs.length = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(rappel: Rappel, options?: IntersectionObserverInit) {
          observateurs.push({ rappel, options });
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    reseau = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        meta: { total: 0, current_page: 1, average: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
      }),
    }));
    vi.stubGlobal('fetch', reseau);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('aucune requête au montage, une à l’approche', async () => {
    render(withIntl(<PropertyReviews slug="villa" propertyId={1} averageRating={null} reviewsCount={0} />));
    await new Promise((r) => setTimeout(r, 20));
    expect(reseau).not.toHaveBeenCalled();
    expect(observateurs.length).toBeGreaterThan(0);

    await act(async () => {
      for (const o of observateurs) o.rappel([{ isIntersecting: true }]);
    });
    await vi.waitFor(() => expect(reseau).toHaveBeenCalledTimes(1));
    expect(String(reseau.mock.calls[0][0])).toContain('/public/properties/villa/reviews');
  });
});
