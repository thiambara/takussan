import { getMeAction } from '@/app/actions/auth';
import { AgencyActivityFeed } from '@/components/dashboard/admin/AgencyActivityFeed';
import { AgencyDegradedState } from '@/components/dashboard/admin/AgencyDegradedState';
import { AgencyKpis } from '@/components/dashboard/admin/AgencyKpis';
import { AgencyRevenueSnapshot } from '@/components/dashboard/admin/AgencyRevenueSnapshot';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isSuperAdmin } from '@/lib/roles';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';

export default async function Page() {
  const user = await getMeAction();

  // TCK-115: super_admin without an agency context cannot scope the report.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Tableau de bord agence" />;
  }

  const payload = await fetchDashboardAgency({ withTimeseries: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Tableau de bord agence</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Vue d&apos;ensemble de l&apos;agence</p>
      </div>

      {payload ? (
        <>
          <AgencyKpis summary={payload.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <AgencyActivityFeed summary={payload.data} />
            <AgencyRevenueSnapshot timeseries={payload.timeseries} />
          </div>
        </>
      ) : (
        <AgencyDegradedState />
      )}
    </div>
  );
}
