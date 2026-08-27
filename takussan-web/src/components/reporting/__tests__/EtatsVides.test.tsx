import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';

const fetchAdminReportCohorts = vi.fn();
const fetchAdminReportFunnel = vi.fn();

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminReportCohorts: (...a: unknown[]) => fetchAdminReportCohorts(...a),
  fetchAdminReportFunnel: (...a: unknown[]) => fetchAdminReportFunnel(...a),
  exportAdminReport: vi.fn(),
}));

const { CohortHeatmap } = await import('../CohortHeatmap');
const { FunnelChart } = await import('../FunnelChart');

function enveloppe(rows: unknown[], totals: Record<string, unknown> = {}) {
  return {
    data: { rows, totals, period: { range: '30d', granularity: 'month' }, generated_at: '2026-08-27T00:00:00+00:00' },
  };
}

function rendre(ui: React.ReactNode) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

/**
 * AC3 — une période sans donnée doit le DIRE. Avant, les quatre surfaces rendaient une zone vide,
 * indistinguable d'un chargement qui n'a pas abouti.
 */
describe('états vides des rapports (TCK-361)', () => {
  beforeEach(() => {
    fetchAdminReportCohorts.mockReset();
    fetchAdminReportFunnel.mockReset();
  });

  it('CohortHeatmap rend un état vide explicite sur `rows: []`', async () => {
    fetchAdminReportCohorts.mockResolvedValue(enveloppe([]));
    rendre(<CohortHeatmap />);

    expect(await screen.findByTestId('cohorts-empty')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('FunnelChart rend un état vide explicite sur `rows: []`', async () => {
    fetchAdminReportFunnel.mockResolvedValue(enveloppe([], { conversion_rate: null }));
    rendre(<FunnelChart />);

    expect(await screen.findByTestId('funnel-empty')).toBeInTheDocument();
  });

  it('FunnelChart rend ses étapes quand il y en a', async () => {
    fetchAdminReportFunnel.mockResolvedValue(
      enveloppe([{ stage: 'listings_published', count: 12 }], { conversion_rate: 0.25 }),
    );
    rendre(<FunnelChart />);

    expect(await screen.findByText('Annonces publiées')).toBeInTheDocument();
    expect(screen.queryByTestId('funnel-empty')).toBeNull();
  });
});
