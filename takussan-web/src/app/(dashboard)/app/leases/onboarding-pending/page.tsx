import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { TenantOnboardingPendingList } from '@/components/leases/TenantOnboardingPendingList';
import { isAdmin, isAgent, isSuperAdmin } from '@/lib/roles';
import { forbidden } from 'next/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.onboardingPending');
  return { title: t('metaTitle') };
}

/**
 * TCK-266 — Console agence : liste des locataires dont la checklist
 * d'onboarding est encore ouverte > 7 j (l'EDL d'entrée est typiquement
 * en cause). Réservée aux membres `agency_admin` / `agent` et au
 * `super_admin`. Les autres tombent en 403 via `forbidden()`.
 */
export default async function Page() {
  const t = await getTranslations('dashboard.onboardingPending');
  const user = await getMeAction();

  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  if (!isAgent(user.roles) && !isAdmin(user.roles)) {
    forbidden();
  }

  if (!user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <TenantOnboardingPendingList agencyId={user.agency_id} />
    </div>
  );
}
