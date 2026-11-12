import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileDirectorySection } from '@/components/profile/ProfileDirectorySection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('annuaire') };
}

/** TCK-2635 — « Annuaire public » du bailleur (TCK-2506 : il n'y paraît que s'il le choisit). */
export default async function ProfileDirectoryPage() {
  const { user } = await faitsDuSommaire();
  return (
    <SectionDuProfil section="annuaire">
      <ProfileDirectorySection listed={user.listed_in_public_directory === true} />
    </SectionDuProfil>
  );
}
