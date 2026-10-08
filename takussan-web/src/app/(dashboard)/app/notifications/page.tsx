import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { NotificationsHistory } from '@/components/notifications/NotificationsHistory';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.notifications');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.notifications');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <NotificationsHistory />
    </div>
  );
}
