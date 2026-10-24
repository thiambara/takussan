/**
 * TCK-1762 (P172.02) — après l'envoi d'un avis, le formulaire ne se réaffiche pas.
 *
 * Mesuré le 2026-10-23 : l'envoi réussi ne relisait que la liste publique des avis, qui ne montre
 * pas un avis en attente de modération, jamais l'éligibilité ; le formulaire vidé restait affiché,
 * et un second envoi rendait 422 `review.property_already_reviewed`. TCK-180 : un utilisateur qui a
 * déjà publié un avis, modéré ou non, ne voit plus le formulaire.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const auth = vi.hoisted(() => ({
  user: { id: 7, roles: ['customer'], agency_id: null } as unknown,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

const actions = vi.hoisted(() => ({
  getReviewEligibility: vi.fn(),
  submitReview: vi.fn(),
  submitReviewReply: vi.fn(),
}));
vi.mock('@/app/actions/property', () => actions);
vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { PropertyReviews } from '../PropertyReviews';

describe('PropertyReviews — après l’envoi d’un avis (TCK-1762)', () => {
  beforeEach(() => {
    actions.getReviewEligibility.mockReset().mockResolvedValue({ eligible: true, alreadyReviewed: false });
    actions.submitReview.mockReset().mockResolvedValue({ ok: true, data: { id: 1 } });
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

  it('un envoi réussi retire le formulaire et dit que l’avis est laissé', async () => {
    const utilisateur = userEvent.setup();
    render(withIntl(<PropertyReviews slug="villa" propertyId={1} averageRating={null} reviewsCount={0} />));

    await utilisateur.click(await screen.findByRole('radio', { name: /5 étoiles/i }));
    await utilisateur.type(screen.getByPlaceholderText(/min\. 10/i), 'Un logement calme et lumineux.');
    await utilisateur.click(screen.getByRole('button', { name: /publier/i }));

    expect(actions.submitReview).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/vous avez déjà laissé un avis sur ce bien/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publier/i })).not.toBeInTheDocument();
  });

  it('un envoi en échec garde le formulaire', async () => {
    actions.submitReview.mockResolvedValue({ ok: false, message: 'Refusé' });
    const utilisateur = userEvent.setup();
    render(withIntl(<PropertyReviews slug="villa" propertyId={1} averageRating={null} reviewsCount={0} />));

    await utilisateur.click(await screen.findByRole('radio', { name: /5 étoiles/i }));
    await utilisateur.type(screen.getByPlaceholderText(/min\. 10/i), 'Un logement calme et lumineux.');
    await utilisateur.click(screen.getByRole('button', { name: /publier/i }));

    expect(await screen.findByText('Refusé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publier/i })).toBeInTheDocument();
    expect(screen.queryByText(/vous avez déjà laissé un avis sur ce bien/i)).not.toBeInTheDocument();
  });
});
