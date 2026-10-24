/**
 * TCK-1515 (P167.02) — « Avis sans réponse » compte les avis sans réponse portés sur les biens du
 * bailleur : son lien ouvre la boîte des avis reçus sur « Sans réponse » et le sujet « Bien », que
 * la boîte lit dans `?reply=` et `?subject=`. Avant, le lien menait à `/app/profile/reviews` nu.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/i18n/locale-serveur', () => ({ localeDeLaRequete: async () => 'fr' }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 3, roles: ['owner'] }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => null }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchOwnerDashboard: async () => ({
    data: {
      period: { start: '2026-10-01', end: '2026-10-31' },
      portfolio: { total: 2 },
      reviews: { unanswered: 4 },
    },
    timeseries: null,
  }),
}));

const { default: Page } = await import('../page');

describe('Aperçu du bailleur — les liens (TCK-1515)', () => {
  it('« Avis sans réponse » ouvre la boîte sur les avis de biens sans réponse', async () => {
    render(await Page());

    const lien = screen.getByRole('link', { name: new RegExp(fr.dashboard.owner.reviewsUnanswered) });
    expect(lien).toHaveAttribute('href', '/app/profile/reviews?reply=unreplied&subject=property');
  });
});
