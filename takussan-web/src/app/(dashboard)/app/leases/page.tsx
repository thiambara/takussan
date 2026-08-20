import type { Metadata } from 'next';
import Link from 'next/link';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.leases');
  return { title: t('metaTitle') };
}
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isSuperAdmin } from '@/lib/roles';
import { LeasesList } from '@/components/leases/LeasesList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canCreateLease && (
          <Link
            href="/app/leases/new"
            className={buttonVariants()}
          >
            {t('newLease')}
          </Link>
        )}
      </div>
      <LeasesList />
    </div>
  );
}
