import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { BrandingBanner } from '@/components/agency/BrandingBanner';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { DashboardMeKpis } from '@/components/dashboard/DashboardMeKpis';
import { DashboardShortcuts } from '@/components/dashboard/DashboardShortcuts';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { WizardDraftsBanner } from '@/components/wizard/WizardDraftsBanner';
import { isAgencyAdmin, isSuperAdmin } from '@/lib/roles';
import { fetchDashboardMe } from '@/lib/queries/dashboard-me';

export default async function DashboardPage() {
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id has no data to display.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Tableau de bord" />;
  }

  const payload = await fetchDashboardMe();

  // TCK-270 — Surface a "Personnalisez votre agence" banner when the
  // agency_admin lands on the dashboard right after activation and hasn't
  // uploaded a logo yet. We swallow fetch errors here so a stale agency
  // record never breaks the dashboard render — the banner just stays hidden.
  let showBrandingBanner = false;
  if (isAgencyAdmin(user.roles) && user.agency_id) {
    const agencyResult = await fetchAgencyAction(user.agency_id);
    if (agencyResult.ok && agencyResult.data) {
      showBrandingBanner = !agencyResult.data.logo_url;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bonjour ${user.first_name}`}
        subtitle="Vue d'ensemble de votre activité"
      />

      {showBrandingBanner ? <BrandingBanner /> : null}

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
