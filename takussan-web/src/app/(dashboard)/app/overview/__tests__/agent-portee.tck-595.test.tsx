/**
 * TCK-595 (ADR-0049 §4, § Direction UX) — la vue agent montre « Mes chiffres » par défaut, et la
 * bascule « Agence » n'apparaît qu'à qui détient `reports.view_agency`. Un `?scope=agency` saisi
 * sans la capacité retombe sur la vue personnelle au lieu de rendre le 403 de l'API.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAgentDashboard, fetchMyCapabilities } from '@/lib/queries/dashboard';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => null }));
vi.mock('@/components/charts/LineChart', () => ({ LineChart: () => null }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchAgentDashboard: vi.fn(async (opts?: { scope?: string }) => ({
    data: {
      agent_id: 7,
      agency_id: 1,
      scope: opts?.scope ?? 'mine',
      period: { start: '2026-07-01', end: '2026-07-31' },
      properties_managed: 3,
      pipeline: {},
      tasks: { open: 0, overdue: 0, items: [] },
      pipeline_ops: { pending_bookings: 0, leases_to_sign: 0, tasks_today: 0 },
      finance: { commissions_month: 0, commissions_year: 0 },
      visits: { upcoming_7d: 0, today_items: [] },
      recent_activity: [],
    },
  })),
  fetchMyCapabilities: vi.fn(async () => []),
}));

import AgentDashboardPage from '../agent/page';

const page = async (scope?: string) =>
  render(await AgentDashboardPage({ searchParams: Promise.resolve(scope ? { scope } : {}) }));

beforeEach(() => {
  vi.mocked(fetchAgentDashboard).mockClear();
  vi.mocked(fetchMyCapabilities).mockResolvedValue([]);
});

describe('vue agent — portée des chiffres', () => {
  it('sans la capacité : pas de bascule, et « agency » demandé à la main retombe sur « mine »', async () => {
    await page('agency');

    expect(fetchAgentDashboard).toHaveBeenCalledWith({ scope: 'mine' });
    expect(screen.queryByRole('navigation', { name: 'Portée des chiffres' })).toBeNull();
    expect(screen.getByText('Mes biens')).toBeInTheDocument();
    expect(screen.getByText('Mes commissions du mois')).toBeInTheDocument();
  });

  it('avec reports.view_agency : la bascule, et « Agence » lit les chiffres de l’agence', async () => {
    vi.mocked(fetchMyCapabilities).mockResolvedValue(['reports.view_agency']);
    await page('agency');

    expect(fetchAgentDashboard).toHaveBeenCalledWith({ scope: 'agency' });
    const bascule = screen.getByRole('navigation', { name: 'Portée des chiffres' });
    expect(bascule).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agence' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Mes chiffres' })).toHaveAttribute('href', '/app/overview/agent');
    expect(screen.getByText('Biens de l’agence'.replace('’', "'"))).toBeInTheDocument();
  });

  it('le détail des commissions mène au grand livre', async () => {
    await page();

    expect(screen.getByRole('link', { name: 'Détail par bail' })).toHaveAttribute('href', '/app/commissions');
  });
});
