import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.documents');
  return { title: t('metaTitle') };
}
import { DocumentsLibrary } from '@/components/documents/DocumentsLibrary';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

/**
 * TCK-062 — bibliothèque centralisée des documents avec filtres, upload
 * drag-drop et partage par lien temporaire.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.documents');
  await getMeAction();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <DocumentsLibrary />
    </div>
  );
}
