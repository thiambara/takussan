import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';
import { AgencyKpiTile } from './AgencyKpiTile';

type Props = {
  summary: DashboardAgencySummary;
};

/**
 * Bandeau KPI agence — 6 tuiles compactes (TCK-131).
 * `unpaid_rate_percent` est exprimé en points (0..100) côté API.
 */
export function AgencyKpis({ summary }: Props) {
  const overdueCount = summary.finance.overdue_count;
  const unpaidRate = summary.finance.unpaid_rate_percent;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <AgencyKpiTile
        label="Biens"
        value={formatNumber(summary.properties.total, 'fr')}
        hint={`${formatNumber(summary.properties.published, 'fr')} publiés`}
      />
      <AgencyKpiTile
        label="Baux actifs"
        value={formatNumber(summary.leases.active, 'fr')}
        accent="success"
      />
      <AgencyKpiTile
        label="Taux d'occupation"
        value={formatPercent(summary.occupancy.rate_percent / 100, 'fr')}
        hint={`${formatNumber(summary.properties.rented, 'fr')} loués / ${formatNumber(summary.properties.total, 'fr')}`}
      />
      <AgencyKpiTile
        label="Revenus du mois"
        value={formatCurrency(summary.finance.revenue_month, 'fr')}
        accent="success"
      />
      <AgencyKpiTile
        label="Impayés"
        value={formatCurrency(summary.finance.overdue_amount, 'fr')}
        hint={overdueCount > 0 ? `${formatNumber(overdueCount, 'fr')} échéances` : undefined}
        accent={overdueCount > 0 ? 'danger' : 'default'}
      />
      <AgencyKpiTile
        label="Taux d'impayés"
        value={formatPercent(unpaidRate / 100, 'fr')}
        accent={unpaidRate >= 10 ? 'warning' : 'default'}
      />
    </div>
  );
}
