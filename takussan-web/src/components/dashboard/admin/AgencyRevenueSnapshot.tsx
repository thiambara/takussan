import { useTranslations } from 'next-intl';

import { BarChart } from '@/components/charts/BarChart';
import { formatCurrency } from '@/lib/format';
import type { DashboardAgencyTimeseries } from '@/lib/queries/dashboard-agency';

type Props = {
  timeseries?: DashboardAgencyTimeseries;
};

/**
 * ⚠ Table de mois volontairement NON traduite (TCK-292, lot L2). Ce n'est pas un libellé
 * d'interface mais du FORMATAGE DE DATE, et le formatage est figé en français dans tout ce
 * dépôt (`formatCurrency(…, 'fr')`, `toLocaleDateString('fr-SN')`) — la dette est nommée dans
 * TCK-292 et attend son propre ticket. La déplacer dans le dictionnaire ferait croire le
 * problème réglé alors que les montants et les dates voisins resteraient français.
 */
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
  const t = useTranslations('dashboard.agencyRevenue');

  if (!timeseries || timeseries.months.length === 0) {
    return (
      <section
        aria-labelledby="agency-revenue-heading"
        className="rounded-2xl bg-app-surface-1 p-6"
      >
        <h2 id="agency-revenue-heading" className="mb-2 text-sm font-semibold text-app-ink">
          {t('heading')}
        </h2>
        <p className="text-xs text-app-ink-muted">{t('empty')}</p>
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
          {t('heading')}
        </h2>
        <p className="text-xs text-app-ink-muted">
          {t('total')} <span className="font-semibold text-app-ink">{formatCurrency(total, 'fr')}</span>
        </p>
      </header>
      <BarChart
        data={{
          labels: timeseries.months.map(shortLabel),
          series: [{ name: t('seriesName'), values: timeseries.revenue }],
        }}
        unit="F"
        className="h-64"
      />
    </section>
  );
}
