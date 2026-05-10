import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { TenantOnboardingPendingList } from '@/components/leases/TenantOnboardingPendingList';
import { isAdmin, isAgent, isSuperAdmin } from '@/lib/roles';
import { forbidden } from 'next/navigation';

export const metadata: Metadata = { title: 'Onboardings en attente' };

/**
 * TCK-266 — Console agence : liste des locataires dont la checklist
 * d'onboarding est encore ouverte > 7 j (l'EDL d'entrée est typiquement
 * en cause). Réservée aux membres `agency_admin` / `agent` et au
 * `super_admin`. Les autres tombent en 403 via `forbidden()`.
 */
export default async function Page() {
  const user = await getMeAction();

  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Onboardings en attente" />;
  }

  if (!isAgent(user.roles) && !isAdmin(user.roles)) {
    forbidden();
  }

  if (!user.agency_id) {
    return <NoAgencyState title="Onboardings en attente" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboardings en attente"
        subtitle="Locataires dont la checklist d'onboarding est ouverte depuis plus de 7 jours."
      />
      <TenantOnboardingPendingList agencyId={user.agency_id} />
    </div>
  );
}
