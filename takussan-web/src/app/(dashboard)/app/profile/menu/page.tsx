import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileMenuSection } from '@/components/profile/ProfileMenuSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('menu') };
}

/** TCK-2635 — « Menu et affichage » : revenir au menu par défaut, barre latérale sur cet appareil (TCK-2480). */
export default async function ProfileMenuPage() {
  return (
    <SectionDuProfil section="menu">
      <ProfileMenuSection />
    </SectionDuProfil>
  );
}
