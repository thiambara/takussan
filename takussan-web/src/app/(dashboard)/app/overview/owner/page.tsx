import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isOwner } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatNumber } from '@/lib/format';

/** TCK-032 P1 — owner (landlord) dashboard. */
export default async function OwnerDashboardPage() {
  const user = await getMeAction();
  if (!isOwner(user.roles) && !isAdmin(user.roles)) {
    redirect('/app/overview');
  }

  const payload = await fetchOwnerDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-app-ink">Vue bailleur</h1>
        <p className="text-sm text-app-ink-muted">Impossible de charger les données.</p>
      </div>
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Vue bailleur</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Mon portefeuille — {data.period.start.slice(0, 10)} au {data.period.end.slice(0, 10)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Biens"
          value={formatNumber(data.portfolio?.total ?? 0, 'fr')}
          hint={`${data.portfolio?.rented ?? 0} loués · ${data.portfolio?.available ?? 0} dispo.`}
        />
        <StatCard
          label="Baux actifs"
          value={formatNumber(data.leases?.active ?? 0, 'fr')}
        />
        <StatCard
          label="Cashflow du mois"
          value={formatCurrency(data.finance?.cashflow_month ?? 0, 'fr')}
          hint={`Attendu : ${formatCurrency(data.finance?.expected_monthly ?? 0, 'fr')}`}
          accent="success"
        />
        <StatCard
          label="Impayés"
          value={formatNumber(data.finance?.overdue_count ?? 0, 'fr')}
          hint={formatCurrency(data.finance?.overdue_amount ?? 0, 'fr')}
          accent={(data.finance?.overdue_count ?? 0) > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Taux d'occupation"
          value={`${data.occupancy?.rate_percent ?? 0}%`}
        />
        <StatCard
          label="Réservations en attente"
          value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
        />
      </div>

      {ts && (
        <section className="rounded-2xl bg-app-surface-1 p-6">
          <LineChart
            title="Cashflow et occupation sur 12 mois"
            data={{
              labels: ts.months,
              series: [
                {
                  name: 'Cashflow (XOF)',
                  values: (ts.cashflow as number[]) ?? [],
                  color: 'stroke-emerald-500',
                },
                {
                  name: 'Occupation (%)',
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
