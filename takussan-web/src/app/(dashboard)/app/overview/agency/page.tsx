import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isSuperAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchAgencyDashboard } from '@/lib/queries/dashboard';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';
import { StatCard } from '@/components/charts/StatCard';
import { LineChart } from '@/components/charts/LineChart';
import { PageHeader } from '@/components/console';
import { formatCurrency, formatNumber } from '@/lib/format';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

/**
 * TCK-032 P1 — agency dashboard.
 * Super_admin / agency_admin / agent d'une agence `standard`. Le reporting
 * cross-équipe n'est pas disponible pour les agences `individual` (un seul
 * collaborateur par construction).
 */
export default async function AgencyDashboardPage() {
  const t = await getTranslations('dashboard.agency');
  const user = await getMeAction();
  if (!isAdmin(user.roles) && !isAgent(user.roles)) {
    redirect('/app/overview');
  }

  // TCK-115: super_admin without agency_id gets 403 from /api/dashboard/agency
  // (Spatie team scope). Guard before the API call to avoid the unhandled exception.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  if (user.agency_id) {
    // FAIL-CLOSED de bout en bout, et la forme compte autant que le test.
    //
    // `fetchAgency` avale son erreur en `null` : un `if (agency && …)` laissait s'afficher
    // l'écran réservé dès que l'API toussait. Mais imbriquer le tout sous `if (token)` rouvre
    // exactement la même porte un cran plus haut — sans jeton, la garde est simplement sautée.
    // Le jeton descend donc DANS l'expression, comme dans les deux pages sœurs
    // (`overview/kpis`, `overview/alerts`) : une seule condition, un seul refus.
    //
    // Un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.
    const token = await getToken();
    const agency = token ? await resolveAgencyOrNull(token, user.agency_id, 'overview/agency', 'decision') : null;
    if (!agency || agency.kind !== 'standard') redirect('/app');
  }

  const payload = await fetchAgencyDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <PageHeader title={t('title')} description={t('loadError')} />
      </div>
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('period', {
          start: data.period.start.slice(0, 10),
          end: data.period.end.slice(0, 10),
        })}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label={t('activeProperties')}
          value={formatNumber(data.properties?.total ?? 0, 'fr')}
          hint={t('publishedHint', { count: data.properties?.published ?? 0 })}
        />
        <StatCard
          label={t('activeLeases')}
          value={formatNumber(data.leases?.active ?? 0, 'fr')}
          hint={t('rentedHint', { count: data.properties?.rented ?? 0 })}
        />
        <StatCard
          label={t('revenueMonth')}
          value={formatCurrency(data.finance?.revenue_month ?? 0, 'fr')}
          hint={t('commissionHint', {
            amount: formatCurrency(data.finance?.commission_month ?? 0, 'fr'),
          })}
          accent="success"
        />
        <StatCard
          label={t('overdue')}
          value={formatNumber(data.finance?.overdue_count ?? 0, 'fr')}
          hint={t('overdueHint', {
            amount: formatCurrency(data.finance?.overdue_amount ?? 0, 'fr'),
            rate: data.finance?.unpaid_rate_percent ?? 0,
          })}
          accent={data.finance && data.finance.unpaid_rate_percent > 15 ? 'danger' : 'warning'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label={t('customers')}
          value={formatNumber(data.customers_count ?? 0, 'fr')}
        />
        <StatCard
          label={t('team')}
          value={formatNumber(data.members_count ?? 0, 'fr')}
        />
        <StatCard
          label={t('pendingRequests')}
          value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
          hint={t('bookingsHint')}
        />
        <StatCard
          label={t('openMaintenance')}
          value={formatNumber(data.maintenance?.open ?? 0, 'fr')}
          accent={(data.maintenance?.open ?? 0) > 5 ? 'warning' : 'default'}
        />
      </div>

      {ts && (
        <section className="rounded-2xl bg-card p-6">
          <LineChart
            title={t('chartTitle')}
            unit=""
            data={{
              labels: ts.months,
              series: [
                { name: t('chartRevenue'), values: (ts.revenue as number[]) ?? [], color: 'stroke-chart-1' },
                {
                  name: t('chartOccupancy'),
                  values: (ts.occupancy as number[]) ?? [],
                  color: 'stroke-chart-2',
                },
              ],
            }}
          />
        </section>
      )}
    </div>
  );
}
