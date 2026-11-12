import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DataExportsPanel } from '@/components/privacy/DataExportsPanel';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.privacy');
  return { title: t('metaTitle') };
}

/**
 * TCK-379 — la portabilité (archive ZIP, exports demandés). TCK-2635 — la section « Mes données » du
 * profil : l'adresse reste, et elle s'ouvre dans le cadre du profil, sommaire compris.
 */
export default async function AccountPrivacyPage() {
  return (
    <SectionDuProfil section="donnees">
      <DataExportsPanel />
    </SectionDuProfil>
  );
}
