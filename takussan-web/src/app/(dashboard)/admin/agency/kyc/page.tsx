import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AgencyKycClient } from '@/components/kyc/AgencyKycClient';
import { PageHeader } from '@/components/console';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.pages.kyc');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('noAgency')} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">
          {t('contactAdmin')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AgencyKycClient agencyId={user.agency_id} />
    </div>
  );
}
