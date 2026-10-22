import type { Metadata } from 'next';
import Link from 'next/link';

import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isSuperAdmin } from '@/lib/roles';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { LeasesList } from '@/components/leases/LeasesList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.leases');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.leases');
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/leases
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  // TCK-173 — `Nouveau bail` n'est pas un geste de client. P152.03 — jugé comme l'API
  // (`LeaseService::create`) : le bailleur, ou le personnel qui tient `leases.create` dans l'agence
  // du profil actif. Une lecture des capacités en panne ne montre rien.
  const lireCapacites =
    (isAgent(user.roles) || isAdmin(user.roles)) && !isSuperAdmin(user.roles) && !isOwner(user.roles);
  const capacites = lireCapacites ? await capacitesDuProfilActif() : [];
  const canCreateLease =
    isSuperAdmin(user.roles) || isOwner(user.roles) || (capacites ?? []).includes('leases.create');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          canCreateLease ? (
            <Link href="/app/leases/new" className={buttonVariants()}>
              {t('newLease')}
            </Link>
          ) : null
        }
      />
      <LeasesList />
    </div>
  );
}
