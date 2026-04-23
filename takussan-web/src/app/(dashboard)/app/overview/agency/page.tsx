import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchAgencyDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatNumber } from '@/lib/format';

/**
 * TCK-032 P1 — agency dashboard.
 * Super_admin / agency_admin / agent inside an agency.
 */
export default async function AgencyDashboardPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles) && !isAgent(user.roles)) {
    redirect('/app/overview');
  }

  const payload = await fetchAgencyDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-app-ink">Vue agence</h1>
        <p className="text-sm text-app-ink-muted">Impossible de charger les données.</p>
      </div>
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Vue agence</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Indicateurs clés sur la période — {data.period.start.slice(0, 10)} au{' '}
          {data.period.end.slice(0, 10)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
        <section className="rounded-2xl bg-app-surface-1 p-6">
          <LineChart
            title="Revenus et occupation sur 12 mois"
            unit=""
            data={{
              labels: ts.months,
              series: [
                { name: 'Revenus', values: (ts.revenue as number[]) ?? [], color: 'stroke-emerald-500' },
                {
                  name: 'Taux d’occupation (%)',
                  values: (ts.occupancy as number[]) ?? [],
                  color: 'stroke-sky-500',
                },
              ],
            }}
          />
        </section>
      )}
    </div>
  );
}
