import { BarChart } from '@/components/charts/BarChart';
import { formatCurrency } from '@/lib/format';
import type { DashboardAgencyTimeseries } from '@/lib/queries/dashboard-agency';

type Props = {
  timeseries?: DashboardAgencyTimeseries;
};

const MONTH_LABELS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function shortLabel(yyyymm: string): string {
  const [, mm] = yyyymm.split('-');
  const idx = Math.max(0, Math.min(11, Number(mm) - 1));
  return MONTH_LABELS[idx];
}

/**
 * Aperçu finance condensé — 12 derniers mois de revenus.
 *
 * Vrai graphique temporel multi-séries en P2 (ticket dédié) ; ici on se
 * contente d'une seule série revenus, alignée sur la sobriété du back-office.
 */
export function AgencyRevenueSnapshot({ timeseries }: Props) {
  if (!timeseries || timeseries.months.length === 0) {
    return (
      <section
        aria-labelledby="agency-revenue-heading"
        className="rounded-2xl bg-app-surface-1 p-6"
      >
        <h2 id="agency-revenue-heading" className="mb-2 text-sm font-semibold text-app-ink">
          Revenus — 12 derniers mois
        </h2>
        <p className="text-xs text-app-ink-muted">Pas encore de données à afficher.</p>
      </section>
    );
  }

  const total = timeseries.revenue.reduce((acc, n) => acc + n, 0);

  return (
    <section
      aria-labelledby="agency-revenue-heading"
      className="rounded-2xl bg-app-surface-1 p-6"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h2 id="agency-revenue-heading" className="text-sm font-semibold text-app-ink">
          Revenus — 12 derniers mois
        </h2>
        <p className="text-xs text-app-ink-muted">
          Total : <span className="font-semibold text-app-ink">{formatCurrency(total, 'fr')}</span>
        </p>
      </header>
      <BarChart
        data={{
          labels: timeseries.months.map(shortLabel),
          series: [{ name: 'Revenus', values: timeseries.revenue }],
        }}
        unit="F"
        className="h-64"
      />
    </section>
  );
}
