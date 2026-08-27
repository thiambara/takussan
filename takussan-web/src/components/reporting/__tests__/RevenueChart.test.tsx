import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';

/**
 * `<RevenueChart>` — la surface REVENUS de TCK-361.
 *
 * ⚠ **Elle n'avait aucun test, et l'implémenteur l'avait déclaré plutôt que masqué.** Une revue
 * adverse a écrit les sondes correspondantes, mesuré que le composant se comporte comme annoncé,
 * puis les a supprimées : le trou n'était pas un défaut de code, c'était une absence de garde. Or
 * AC4 exige la comparaison sur croissance ET revenus, et c'est du côté revenus que le défaut se
 * voit le moins — deux séries qui se confondent ne lèvent aucune erreur, elles se superposent.
 *
 * Ce fichier est cette garde. Il double, côté front, ce que
 * `test_two_distinct_revenue_windows_do_not_share_a_cache_entry` garde côté API.
 */

const fetchAdminReportRevenue = vi.fn();
const exportAdminReport = vi.fn();

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminReportRevenue: (...args: unknown[]) => fetchAdminReportRevenue(...args),
  exportAdminReport: (...args: unknown[]) => exportAdminReport(...args),
}));

const { RevenueChart } = await import('../RevenueChart');

function enveloppe(buckets: Array<{ bucket: string; mrr: number }>) {
  const rows = buckets.map((b) => ({
    bucket: b.bucket,
    starts_at: `${b.bucket}-01T00:00:00+00:00`,
    ends_at: `${b.bucket}-28T23:59:59+00:00`,
    mrr: b.mrr,
    arr: b.mrr * 12,
    active_subscriptions: 2,
  }));
  const dernier = rows[rows.length - 1];

  return {
    data: {
      rows,
      totals: {
        latest_mrr: dernier?.mrr ?? 0,
        latest_arr: dernier?.arr ?? 0,
        latest_active_subscriptions: dernier?.active_subscriptions ?? 0,
      },
      period: { range: '12m', granularity: 'month' },
      generated_at: '2026-08-27T00:00:00+00:00',
    },
  };
}

function rendre() {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <RevenueChart />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('<RevenueChart> (TCK-361)', () => {
  beforeEach(() => {
    fetchAdminReportRevenue.mockReset();
    exportAdminReport.mockReset();
    exportAdminReport.mockResolvedValue({ status: 'downloaded', filename: 'x.csv' });
    fetchAdminReportRevenue.mockResolvedValue(
      enveloppe([{ bucket: '2026-01', mrr: 35_000 }, { bucket: '2026-02', mrr: 60_000 }]),
    );
  });

  it('rend le graphique temporel commun et son tableau', async () => {
    rendre();

    expect(await screen.findByTestId('timeseries-chart')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  /** AC3 — une fenêtre sans donnée le DIT ; elle ne rend pas une carte vide. */
  it('rend un état vide explicite sur `rows: []`', async () => {
    fetchAdminReportRevenue.mockResolvedValue(enveloppe([]));
    rendre();

    expect(await screen.findByTestId('timeseries-empty')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  /**
   * AC4 côté REVENUS — la comparaison est un SECOND APPEL sur la fenêtre décalée, déduite des
   * bornes que le premier a rendues. C'est la surface où le défaut de clé de cache se voyait le
   * moins : les deux séries deviendraient byte-identiques, sans erreur.
   */
  it('déclenche un second appel sur la fenêtre décalée quand on active la comparaison', async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    await user.click(screen.getByRole('button', { name: /comparer à la période précédente/i }));

    await waitFor(() => {
      const decalee = fetchAdminReportRevenue.mock.calls
        .map(([p]) => p)
        .find((p) => p.starts_at && p.ends_at);
      expect(decalee).toBeDefined();
      // Elle précède STRICTEMENT la fenêtre affichée (2026-01-01 → 2026-02-28).
      expect(decalee.ends_at < '2026-01-01').toBe(true);
    });

    expect(await screen.findByTestId('serie-comparaison')).toBeInTheDocument();
  });

  /**
   * AC5 — l'export porte la fenêtre RÉELLEMENT affichée. La période est déplacée avant d'exporter :
   * un export figé sur le raccourci par défaut (`12m`) ne peut plus le cocher.
   */
  it("transmet à l'export la fenêtre réellement posée", async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    await user.click(screen.getByLabelText('Période'));
    await user.click(await screen.findByRole('option', { name: '3 mois' }));

    await waitFor(() => expect(fetchAdminReportRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ period: '3m' }),
    ));

    await user.click(screen.getByRole('button', { name: /exporter csv/i }));

    await waitFor(() => expect(exportAdminReport).toHaveBeenCalledWith('revenue', {
      granularity: 'month',
      period: '3m',
    }));
  });
});
