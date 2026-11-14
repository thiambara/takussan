import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileAgentDirectorySection } from '@/components/profile/ProfileAgentDirectorySection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('fiche') };
}

/** TCK-2635 — « Fiche publique » de l'agent : ses langues et ses quartiers (TCK-2518, TCK-2524). */
export default async function ProfilePublicProfilePage() {
  return (
    <SectionDuProfil section="fiche">
      <ProfileAgentDirectorySection />
    </SectionDuProfil>
  );
}
