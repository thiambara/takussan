import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';

const fetchAdminReportGrowth = vi.fn();
const exportAdminReport = vi.fn();

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminReportGrowth: (...args: unknown[]) => fetchAdminReportGrowth(...args),
  exportAdminReport: (...args: unknown[]) => exportAdminReport(...args),
}));

const { GrowthChart } = await import('../GrowthChart');

function enveloppe(rows: Array<{ bucket: string; count: number }>) {
  return {
    data: {
      rows: rows.map((r) => ({
        ...r,
        starts_at: `${r.bucket}-01T00:00:00+00:00`,
        ends_at: `${r.bucket}-28T23:59:59+00:00`,
      })),
      totals: { total: rows.reduce((a, r) => a + r.count, 0) },
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
          <GrowthChart />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('<GrowthChart> (TCK-361)', () => {
  beforeEach(() => {
    fetchAdminReportGrowth.mockReset();
    exportAdminReport.mockReset();
    exportAdminReport.mockResolvedValue({ status: 'downloaded', filename: 'x.csv' });
    fetchAdminReportGrowth.mockResolvedValue(
      enveloppe([{ bucket: '2026-01', count: 3 }, { bucket: '2026-02', count: 7 }]),
    );
  });

  it('rend le graphique temporel commun, pas des div à hauteur en pourcentage', async () => {
    rendre();

    expect(await screen.findByTestId('timeseries-chart')).toBeInTheDocument();
  });

  /** AC3 — une période sans donnée rend l'état vide, pas une carte vide. */
  it('rend un état vide explicite sur `rows: []`', async () => {
    fetchAdminReportGrowth.mockResolvedValue(enveloppe([]));
    rendre();

    expect(await screen.findByTestId('timeseries-empty')).toBeInTheDocument();
  });

  /**
   * AC5 — l'export porte les filtres ACTIFS. Le défaut qu'il ferme est silencieux : un export
   * figé sur les paramètres par défaut télécharge un fichier plausible, simplement pas celui
   * qu'on regardait.
   */
  it("transmet à l'export la métrique affichée", async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    await user.click(screen.getByRole('button', { name: /exporter csv/i }));

    await waitFor(() => expect(exportAdminReport).toHaveBeenCalledWith('growth', {
      metric: 'agencies',
      granularity: 'month',
      period: '12m',
    }));
  });

  /**
   * AC4 + AC5 — la comparaison est un SECOND APPEL sur la fenêtre décalée, déduite des bornes que
   * le premier a rendues. Elle n'était pas seulement absente de l'écran : elle n'était pas
   * demandable, `period` étant une énumération fermée ancrée sur `now()` côté API.
   */
  it('déclenche un second appel sur la fenêtre décalée quand on active la comparaison', async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    await user.click(screen.getByRole('button', { name: /comparer à la période précédente/i }));

    await waitFor(() => {
      const fenetres = fetchAdminReportGrowth.mock.calls.map(([p]) => p);
      const decalee = fenetres.find((p) => p.starts_at && p.ends_at);
      expect(decalee).toBeDefined();
      // La fenêtre décalée précède strictement celle qui est affichée (2026-01-01 → 2026-02-28).
      expect(decalee.ends_at < '2026-01-01').toBe(true);
    });

    expect(await screen.findByTestId('serie-comparaison')).toBeInTheDocument();
  });

  /** La bascule est un vrai contrôle à deux états, pas un bouton muet. */
  it('annonce l’état de la bascule de comparaison', async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    const bascule = screen.getByRole('button', { name: /comparer à la période précédente/i });
    expect(bascule).toHaveAttribute('aria-pressed', 'false');

    await user.click(bascule);
    expect(bascule).toHaveAttribute('aria-pressed', 'true');
  });
});
