import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
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
  const t = useTranslations('dashboard.agencyKpis');
  // Les six tuiles passaient une locale ÉCRITE EN DUR aux dix formatteurs ci-dessous (TCK-374).
  const brute = useLocale();
  const locale = isLocale(brute) ? brute : DEFAULT_LOCALE;
  const overdueCount = summary.finance.overdue_count;
  const unpaidRate = summary.finance.unpaid_rate_percent;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <AgencyKpiTile
        label={t('properties')}
        value={formatNumber(summary.properties.total, locale)}
        hint={t('publishedHint', { count: formatNumber(summary.properties.published, locale) })}
      />
      <AgencyKpiTile
        label={t('activeLeases')}
        value={formatNumber(summary.leases.active, locale)}
        accent="success"
      />
      <AgencyKpiTile
        label={t('occupancyRate')}
        value={formatPercent(summary.occupancy.rate_percent / 100, locale)}
        hint={t('occupancyHint', {
          rented: formatNumber(summary.properties.rented, locale),
          total: formatNumber(summary.properties.total, locale),
        })}
      />
      <AgencyKpiTile
        label={t('revenueMonth')}
        value={formatCurrency(summary.finance.revenue_month, locale)}
        accent="success"
      />
      <AgencyKpiTile
        label={t('overdue')}
        value={formatCurrency(summary.finance.overdue_amount, locale)}
        hint={overdueCount > 0 ? t('overdueHint', { count: formatNumber(overdueCount, locale) }) : undefined}
        accent={overdueCount > 0 ? 'danger' : 'default'}
      />
      <AgencyKpiTile
        label={t('unpaidRate')}
        value={formatPercent(unpaidRate / 100, locale)}
        accent={unpaidRate >= 10 ? 'warning' : 'default'}
      />
    </div>
  );
}
