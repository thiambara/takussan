import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { CalendarPage } from '@/components/calendar/CalendarPage';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.calendar');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.calendar');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CalendarPage />
    </div>
  );
}
