import { getTranslations } from 'next-intl/server';
import { AdminPlansClient } from '@/components/billing/AdminPlansClient';
import { PageHeader } from '@/components/console';

export default async function Page() {
  const t = await getTranslations('superAdmin.pages.plans');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <AdminPlansClient />
    </div>
  );
}
