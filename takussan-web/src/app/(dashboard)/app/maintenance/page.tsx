import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.maintenance');
  return { title: t('metaTitle') };
}
import { MaintenanceList } from '@/components/maintenance';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.maintenance');
  await getMeAction();
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <MaintenanceList />
    </div>
  );
}
