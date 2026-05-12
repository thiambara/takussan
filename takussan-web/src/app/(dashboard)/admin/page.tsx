import { getMeAction } from '@/app/actions/auth';
import { AgencyActivityFeed } from '@/components/dashboard/admin/AgencyActivityFeed';
import { AgencyDegradedState } from '@/components/dashboard/admin/AgencyDegradedState';
import { AgencyKpis } from '@/components/dashboard/admin/AgencyKpis';
import { AgencyRevenueSnapshot } from '@/components/dashboard/admin/AgencyRevenueSnapshot';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isSuperAdmin } from '@/lib/roles';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';

export default async function Page() {
  const user = await getMeAction();

  // TCK-115: super_admin without an agency context cannot scope the report.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Tableau de bord agence" />;
  }

  await ensureStandardAgencyOrRedirect(user);

  const payload = await fetchDashboardAgency({ withTimeseries: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord agence"
        subtitle="Vue d'ensemble de l'agence"
      />

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
