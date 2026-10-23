/**
 * TCK-1830 (P136.05) — le tableau de bord d'agence rend la carte « Mise en service » et le compte
 * d'invitations au premier affichage : la page serveur les lit, et les amorce dans TanStack.
 *
 * Mesuré le 2026-10-23 : les deux partaient du navigateur après l'hydratation, et la carte, en
 * tête de page, arrivait après coup.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const { getMe, resolveAgency, apiRequest } = vi.hoisted(() => ({
  getMe: vi.fn(),
  resolveAgency: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});
vi.mock('@/lib/queries/kyc', () => ({
  fetchAgencyKyc: async () => ({ data: { status: 'verified' } }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton' }) }));
vi.mock('@/components/charts/LineChart', () => ({ LineChart: () => null }));

const { default: Page } = await import('../page');

const CHARGE = {
  data: {
    agency_id: 7,
    period: { start: '2026-08-01', end: '2026-08-30' },
    properties: { total: 41, published: 37, rented: 29, available: 12 },
    leases: { active: 43 },
    customers_count: 53,
    members_count: 19,
    bookings: { pending: 83 },
    maintenance: { open: 65 },
    finance: { revenue_month: 1, commission_month: 1, overdue_count: 0, overdue_amount: 0, unpaid_rate_percent: 0 },
    occupancy: { rate_percent: 70 },
  },
  timeseries: { months: [], revenue: [], occupancy: [] },
};

const MISE_EN_SERVICE = {
  data: {
    complete: false,
    steps: [
      { key: 'admin_two_factor', done: true },
      { key: 'logo', done: false },
    ],
  },
};

const appelsA = (prefixe: string) =>
  apiRequest.mock.calls.filter(([chemin]) => typeof chemin === 'string' && chemin.startsWith(prefixe));

beforeEach(() => {
  vi.clearAllMocks();
  getMe.mockResolvedValue({ id: 1, roles: ['agency_admin'], agency_id: 7 });
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
  apiRequest.mockImplementation(async (chemin: string) => {
    if (chemin.startsWith('/api/dashboard/agency')) return CHARGE;
    if (chemin === '/api/agencies/7/setup-status') return MISE_EN_SERVICE;
    if (chemin.startsWith('/api/invitations')) return { data: [], meta: { total: 4 } };
    if (chemin.startsWith('/api/admin-users') || chemin.startsWith('/api/property-moderation')) {
      return { data: [], meta: { total: 0 } };
    }
    throw new Error(`appel inattendu : ${chemin}`);
  });
});

async function rendre() {
  const page = (await Page()) as ReactNode;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{page}</QueryClientProvider>));
}

describe('/app/overview/agency — mise en service et invitations au premier rendu (TCK-1830)', () => {
  it('AC1 — la carte de mise en service et le compte d’invitations sont là au premier rendu', async () => {
    await rendre();

    expect(screen.getByTestId('agency-setup-status')).toBeInTheDocument();
    expect(screen.getByTestId('queue-value-invitations')).toHaveTextContent('4');
    // Lues par le serveur avec le jeton de la page.
    expect(appelsA('/api/agencies/7/setup-status')[0]?.[1]).toMatchObject({ token: 'jeton' });
    expect(appelsA('/api/invitations')[0]?.[1]).toMatchObject({ token: 'jeton' });
  });

  it('AC2 — `GET /api/dashboard/agency` reste lu une seule fois', async () => {
    await rendre();
    expect(appelsA('/api/dashboard/agency')).toHaveLength(1);
  });
});
