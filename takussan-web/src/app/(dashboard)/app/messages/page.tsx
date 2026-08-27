import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { MessagesPage } from '@/components/messages/MessagesPage';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.messages');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.messages');
  await getMeAction();
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <MessagesPage />
    </div>
  );
}
