import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChoixDeLangue } from '@/components/profile/sommaire/ChoixDeLangue';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('langue') };
}

/** TCK-2635 — « Langue » de l'interface, le geste du menu du compte (TCK-2491). */
export default async function ProfileLanguagePage() {
  return (
    <SectionDuProfil section="langue">
      <ChoixDeLangue />
    </SectionDuProfil>
  );
}
