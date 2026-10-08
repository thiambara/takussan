/**
 * TCK-591, AC26 — « Tâches du jour » du tableau de bord agent mène à la page des tâches filtrée sur
 * aujourd'hui. Elle pointait sur `/app/overview/agent` : la page elle-même.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => null }));
vi.mock('@/components/charts/LineChart', () => ({ LineChart: () => null }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchAgentDashboard: vi.fn(async () => ({
    data: {
      period: { start: '2026-10-01', end: '2026-10-31' },
      properties_managed: 4,
      pipeline: {},
      tasks: { open: 3, overdue: 0, today: 2, items: [] },
      pipeline_ops: { pending_bookings: 0, leases_to_sign: 0, tasks_today: 2 },
      finance: { commissions_month: 0, commissions_year: 0 },
      visits: { upcoming_7d: 0, today_items: [] },
      recent_activity: [],
    },
    timeseries: {},
  })),
}));

import AgentDashboardPage from '../agent/page';

describe('tableau de bord agent — Tâches du jour (AC26)', () => {
  it('pointe sur /app/tasks?filter[due]=today', async () => {
    render(await AgentDashboardPage());

    const lien = screen.getByRole('link', { name: /Tâches du jour/ });
    expect(lien).toHaveAttribute('href', '/app/tasks?filter[due]=today');
  });
});
