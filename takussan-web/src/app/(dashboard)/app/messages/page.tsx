import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.messages');
  return { title: t('metaTitle') };
}
import { MessagesPage } from '@/components/messages/MessagesPage';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.messages');
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <MessagesPage />
    </div>
  );
}
