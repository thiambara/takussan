import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { EspaceDesDocuments } from '@/components/documents/EspaceDesDocuments';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.documents');
  return { title: t('metaTitle') };
}

/**
 * TCK-062 — bibliothèque centralisée des documents avec filtres, upload
 * drag-drop et partage par lien temporaire.
 *
 * TCK-2656 — la bibliothèque est celle du personnel de l'agence ; tout autre profil ouvre son coffre
 * par dossier (`EspaceDesDocuments` choisit sur le profil actif).
 *
 * TCK-2896 — le personnel de l'agence ouvre les documents de l'agence par bien et par bail, qui portent
 * leur propre en-tête : la page n'en passe plus.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await getMeAction();

  return <EspaceDesDocuments />;
}
