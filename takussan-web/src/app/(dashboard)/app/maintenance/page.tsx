import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { MaintenanceList } from '@/components/maintenance';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.maintenance');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.maintenance');
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <MaintenanceList />
    </div>
  );
}
