import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isSuperAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchAgencyDashboard } from '@/lib/queries/dashboard';
import { fetchAgency } from '@/lib/queries/agencies';
import { getToken } from '@/lib/session';
import { StatCard } from '@/components/charts/StatCard';
import { LineChart } from '@/components/charts/LineChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatCurrency, formatNumber } from '@/lib/format';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

/**
 * TCK-032 P1 — agency dashboard.
 * Super_admin / agency_admin / agent d'une agence `standard`. Le reporting
 * cross-équipe n'est pas disponible pour les agences `individual` (un seul
 * collaborateur par construction).
 */
export default async function AgencyDashboardPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles) && !isAgent(user.roles)) {
    redirect('/app/overview');
  }

  // TCK-115: super_admin without agency_id gets 403 from /api/dashboard/agency
  // (Spatie team scope). Guard before the API call to avoid the unhandled exception.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Vue agence" />;
  }

  if (user.agency_id) {
    const token = await getToken();
    if (token) {
      const agency = await fetchAgency(token, user.agency_id).catch(() => null);
      // FAIL-CLOSED : `!agency` redirige AUSSI. `fetchAgency` avale son erreur en `null`
      // (`.catch(() => null)`), donc `if (agency && …)` laissait passer une API en panne :
      // l'écran pro s'affichait pour une agence `individual` dès que la requête échouait.
      // Un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.
      if (!agency || agency.kind !== 'standard') redirect('/app');
    }
  }

  const payload = await fetchAgencyDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <PageHeader title="Vue agence" subtitle="Impossible de charger les données." />
      </div>
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vue agence"
        subtitle={`Indicateurs clés sur la période — ${data.period.start.slice(0, 10)} au ${data.period.end.slice(0, 10)}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Biens actifs"
          value={formatNumber(data.properties?.total ?? 0, 'fr')}
          hint={`${data.properties?.published ?? 0} publiés`}
        />
        <StatCard
          label="Baux actifs"
          value={formatNumber(data.leases?.active ?? 0, 'fr')}
          hint={`${data.properties?.rented ?? 0} biens loués`}
        />
        <StatCard
          label="Revenus du mois"
          value={formatCurrency(data.finance?.revenue_month ?? 0, 'fr')}
          hint={`Commissions : ${formatCurrency(data.finance?.commission_month ?? 0, 'fr')}`}
          accent="success"
        />
        <StatCard
          label="Impayés"
          value={formatNumber(data.finance?.overdue_count ?? 0, 'fr')}
          hint={`${formatCurrency(data.finance?.overdue_amount ?? 0, 'fr')} · ${
            data.finance?.unpaid_rate_percent ?? 0
          }%`}
          accent={data.finance && data.finance.unpaid_rate_percent > 15 ? 'danger' : 'warning'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Clients"
          value={formatNumber(data.customers_count ?? 0, 'fr')}
        />
        <StatCard
          label="Équipe"
          value={formatNumber(data.members_count ?? 0, 'fr')}
        />
        <StatCard
          label="Demandes en attente"
          value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
          hint="Réservations"
        />
        <StatCard
          label="Maintenance ouverte"
          value={formatNumber(data.maintenance?.open ?? 0, 'fr')}
          accent={(data.maintenance?.open ?? 0) > 5 ? 'warning' : 'default'}
        />
      </div>

      {ts && (
        <section className="rounded-2xl bg-card p-6">
          <LineChart
            title="Revenus et occupation sur 12 mois"
            unit=""
            data={{
              labels: ts.months,
              series: [
                { name: 'Revenus', values: (ts.revenue as number[]) ?? [], color: 'stroke-chart-1' },
                {
                  name: 'Taux d’occupation (%)',
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
