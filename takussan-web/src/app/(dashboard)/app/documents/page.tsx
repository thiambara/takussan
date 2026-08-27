import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { DocumentsLibrary } from '@/components/documents/DocumentsLibrary';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.documents');
  return { title: t('metaTitle') };
}

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
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <DocumentsLibrary />
    </div>
  );
}
