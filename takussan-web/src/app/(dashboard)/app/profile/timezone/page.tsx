import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileTimezoneSection } from '@/components/profile/ProfileTimezoneSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('fuseau') };
}

/** TCK-2635 — « Fuseau horaire » des rendus de l'API (TCK-1497). */
export default async function ProfileTimezonePage() {
  const { user } = await faitsDuSommaire();
  return (
    <SectionDuProfil section="fuseau">
      <ProfileTimezoneSection timezone={user.timezone} />
    </SectionDuProfil>
  );
}
