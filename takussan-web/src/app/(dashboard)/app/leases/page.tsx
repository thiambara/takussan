import type { Metadata } from 'next';
import Link from 'next/link';

import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isSuperAdmin } from '@/lib/roles';
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

  // TCK-173 — `Nouveau bail` is an agent/admin/owner action, not a customer one.
  const canCreateLease = isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles);

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
