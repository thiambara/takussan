/**
 * TCK-1735 (P167.05) — « Demandes en attente » : sous « Mes chiffres », le nombre compte les
 * réservations des biens de l'agent, et le lien porte cette portée (`?only_mine=1`) ; sous
 * « Agence », le nombre et la liste sont ceux de l'agence, et le lien reste nu.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/i18n/locale-serveur', () => ({ localeDeLaRequete: async () => 'fr' }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => ['reports.view_agency'] }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchAgentDashboard: async ({ scope }: { scope: string }) => ({
    data: {
      scope,
      period: { start: '2026-10-01', end: '2026-10-31' },
      pipeline_ops: { pending_bookings: 3, leases_to_sign: 4, tasks_today: 5 },
    },
    timeseries: null,
  }),
}));

const { default: Page } = await import('../page');

const lien = () => screen.getByRole('link', { name: new RegExp(fr.dashboard.agent.pendingRequests) });

describe('Aperçu de l’agent — « Demandes en attente » (TCK-1735)', () => {
  it('sous « Mes chiffres », ouvre les réservations de ses biens', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(lien()).toHaveAttribute('href', '/app/bookings?only_mine=1');
  });

  it('sous « Agence », ouvre celles de l’agence', async () => {
    render(await Page({ searchParams: Promise.resolve({ scope: 'agency' }) }));
    expect(lien()).toHaveAttribute('href', '/app/bookings');
  });
});
