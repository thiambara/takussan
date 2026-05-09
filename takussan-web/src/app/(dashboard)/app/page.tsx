import { getMeAction } from '@/app/actions/auth';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { DashboardMeKpis } from '@/components/dashboard/DashboardMeKpis';
import { DashboardShortcuts } from '@/components/dashboard/DashboardShortcuts';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isSuperAdmin } from '@/lib/roles';
import { fetchDashboardMe } from '@/lib/queries/dashboard-me';

export default async function DashboardPage() {
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id has no data to display.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Tableau de bord" />;
  }

  const payload = await fetchDashboardMe();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Bonjour {user.first_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vue d&apos;ensemble de votre activité</p>
      </div>

      {payload?.data ? (
        <DashboardMeKpis role={payload.data.role} metrics={payload.data.metrics} />
      ) : (
        <DashboardEmpty roles={user.roles} />
      )}

      <DashboardShortcuts roles={user.roles} agencyId={user.agency_id} />
    </div>
  );
}
