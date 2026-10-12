import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { AgencyKycClient } from '@/components/kyc/AgencyKycClient';
import { PageHeader } from '@/components/console';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await garderPageAdmin('/admin/agency/kyc');
  const t = await getTranslations('admin.pages.kyc');
  const user = await getMeAction();

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
