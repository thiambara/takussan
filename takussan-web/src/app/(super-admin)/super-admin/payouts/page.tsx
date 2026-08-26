import { getTranslations } from 'next-intl/server';
import { AdminPayoutsClient } from '@/components/billing/AdminPayoutsClient';
import { PageHeader } from '@/components/console';

export default async function Page() {
  const t = await getTranslations('superAdmin.pages.payouts');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <AdminPayoutsClient />
    </div>
  );
}
