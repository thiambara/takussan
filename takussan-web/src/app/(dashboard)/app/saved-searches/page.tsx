import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { SavedSearchesList } from '@/components/favorites/SavedSearchesList';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.savedSearches');
  return { title: t('metaTitle') };
}

/**
 * Dashboard page — lists the user's saved searches with a shortcut to
 * replay them on `/properties`. Wave 3 / TCK-047.
 */
export default async function SavedSearchesPage() {
  const t = await getTranslations('dashboard.pages.savedSearches');
  await getMeAction();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <SavedSearchesList />
    </div>
  );
}
