import { getMeAction } from '@/app/actions/auth';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { DashboardMeKpis } from '@/components/dashboard/DashboardMeKpis';
import { DashboardShortcuts } from '@/components/dashboard/DashboardShortcuts';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { WizardDraftsBanner } from '@/components/wizard/WizardDraftsBanner';
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
      <PageHeader
        title={`Bonjour ${user.first_name}`}
        subtitle="Vue d'ensemble de votre activité"
      />

      {/* TCK-250 — Resumable wizard drafts banner. Renders nothing when no drafts. */}
      <WizardDraftsBanner />

      {payload?.data ? (
        <DashboardMeKpis role={payload.data.role} metrics={payload.data.metrics} />
      ) : (
        <DashboardEmpty roles={user.roles} />
      )}

      <DashboardShortcuts roles={user.roles} agencyId={user.agency_id} />
    </div>
  );
}
