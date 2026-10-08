/**
 * TCK-595 — la vue bailleur.
 *
 * AC4 bis : la carte « Prochains versements » ne lit que les versements AU BAILLEUR encore à venir.
 * Depuis TCK-594, `landlord_id` porte aussi les versements nés de ses baux et destinés à d'autres
 * (restitution de caution, facture d'un prestataire).
 *
 * AC8 : les cartes de la colonne « Demandes en attente » portent chacune leur nombre ; le texte fixe
 * « Voir le module » n'est plus rendu.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appels = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/components/charts/LineChart', () => ({ LineChart: () => null }));
vi.mock('@/lib/session', () => ({ getToken: vi.fn(async () => 'jeton') }));
vi.mock('@/app/actions/auth', () => ({
  getMeAction: vi.fn(async () => ({ id: 7, roles: ['owner'] })),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async (url: string) => {
    appels.urls.push(url);
    return { data: [], meta: {} };
  }),
}));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchOwnerDashboard: vi.fn(async () => ({
    data: {
      owner_id: 7,
      period: { start: '2026-07-01', end: '2026-07-31' },
      portfolio: { total: 3, rented: 1, available: 2 },
      leases: { active: 1 },
      bookings: { pending: 4 },
      finance: { cashflow_month: 0, expected_monthly: 0, overdue_count: 0, overdue_amount: 0 },
      occupancy: { rate_percent: 0 },
      maintenance: { quotes_pending: 2 },
      visits: { to_confirm: 1 },
      reviews: { unanswered: 3 },
    },
  })),
}));

import OwnerDashboardPage from '../owner/page';

beforeEach(() => {
  appels.urls = [];
});

describe('vue bailleur — prochains versements (AC4 bis)', () => {
  it('ne demande que les versements au bailleur, en attente, planifiés ou en cours', async () => {
    render(await OwnerDashboardPage());

    const url = appels.urls.find((u) => u.startsWith('/api/payouts'));
    expect(url).toBeDefined();
    const params = new URLSearchParams(url!.split('?')[1]);
    expect(params.get('filter[landlord_id]')).toBe('7');
    expect(params.get('filter[payee_role]')).toBe('landlord');
    expect(params.get('filter[status]')).toBe('pending,scheduled,processing');
  });
});

describe('vue bailleur — cartes actionnables (AC8)', () => {
  it('chaque carte mène à son module et porte son nombre', async () => {
    render(await OwnerDashboardPage());

    expect(screen.getByRole('link', { name: /Devis à valider\s*2/ })).toHaveAttribute('href', '/app/maintenance');
    expect(screen.getByRole('link', { name: /Visites à confirmer\s*1/ })).toHaveAttribute('href', '/app/visits');
    expect(screen.getByRole('link', { name: /Avis sans réponse\s*3/ })).toHaveAttribute('href', '/app/profile/reviews');
    expect(screen.queryByText('Voir le module')).toBeNull();
  });
});
