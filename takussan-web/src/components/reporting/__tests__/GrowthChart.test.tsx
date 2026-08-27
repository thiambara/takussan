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

/**
 * Le sélecteur de dates est un popover + calendrier (primitive partagée, TCK-357) : le piloter au
 * clavier ferait dépendre ce test de la locale du calendrier, qui n'est pas son sujet. Il est
 * remplacé par le `<input type="date">` qu'il remplace lui-même en production — même contrat de
 * valeur (`YYYY-MM-DD` ou chaîne vide), même `data-testid`.
 */
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, 'data-testid': testId, 'aria-label': label }: {
    value?: string;
    onValueChange: (v: string) => void;
    'data-testid'?: string;
    'aria-label'?: string;
  }) => (
    <input
      type="date"
      aria-label={label}
      data-testid={testId}
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
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
   * AC5 — l'export porte les filtres ACTIFS.
   *
   * ⚠ **Ce test DÉPLACE les filtres avant d'exporter, et c'est tout son objet.** Sa première
   * version montait le composant dans son état par défaut (`agencies` / `12m`) et vérifiait que
   * l'export recevait… `agencies` / `12m`. Une revue adverse l'a défait en une mutation : un export
   * ENTIÈREMENT figé en dur — `params={{ metric: 'agencies', granularity: 'month', period: '12m' }}`
   * — le laissait vert, c'est-à-dire exactement le défaut que l'AC ferme (« un export figé sur les
   * paramètres par défaut télécharge un fichier plausible, simplement pas celui qu'on regardait »).
   *
   * D'où deux valeurs qui ne sont celles d'AUCUN défaut : la métrique passe à `users` et la période
   * à `3m`. Un export figé ne peut plus les produire, quelle que soit la constante choisie.
   */
  it("transmet à l'export les filtres RÉELLEMENT posés, pas ceux par défaut", async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    // Les options vivent dans un portail : elles ne se rendent qu'une fois le déclencheur ouvert.
    await user.click(screen.getByLabelText('Métrique'));
    await user.click(await screen.findByRole('option', { name: 'Utilisateurs' }));

    await user.click(screen.getByLabelText('Période'));
    await user.click(await screen.findByRole('option', { name: '3 mois' }));

    // La série affichée doit d'abord AVOIR bougé : exporter les filtres d'un graphique qui n'a pas
    // suivi ne vaudrait pas mieux que l'inverse.
    await waitFor(() => expect(fetchAdminReportGrowth).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'users', period: '3m' }),
    ));

    await user.click(screen.getByRole('button', { name: /exporter csv/i }));

    await waitFor(() => expect(exportAdminReport).toHaveBeenCalledWith('growth', {
      metric: 'users',
      granularity: 'month',
      period: '3m',
    }));
  });

  /**
   * AC5, second versant — une PLAGE LIBRE voyage jusqu'à l'export, et elle y remplace `period`.
   *
   * C'est le versant qu'aucune constante ne peut imiter : un export figé sur un raccourci n'émettra
   * jamais `starts_at`. Le sélecteur de dates est ici remplacé par un `<input type="date">` — c'est
   * une primitive partagée (TCK-357), gardée par ses propres tests ; ce qui est éprouvé ici, c'est
   * le CHEMIN qui va de la fenêtre posée à la requête et au téléchargement.
   */
  it("transmet à l'export une plage libre, à la place du raccourci", async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByTestId('timeseries-chart');

    await user.type(screen.getByTestId('plage-debut'), '2026-03-15');
    await user.type(screen.getByTestId('plage-fin'), '2026-03-31');
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(fetchAdminReportGrowth).toHaveBeenCalledWith(
      expect.objectContaining({ starts_at: '2026-03-15', ends_at: '2026-03-31' }),
    ));

    await user.click(screen.getByRole('button', { name: /exporter csv/i }));

    await waitFor(() => expect(exportAdminReport).toHaveBeenCalledWith('growth', {
      metric: 'agencies',
      granularity: 'month',
      starts_at: '2026-03-15',
      ends_at: '2026-03-31',
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
