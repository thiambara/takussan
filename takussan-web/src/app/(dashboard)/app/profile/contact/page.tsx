import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileContactSection } from '@/components/profile/ProfileContactSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('coordonnees') };
}

/** TCK-2635 — « Coordonnées » : téléphone (et sa vérification), courriel, présentation. */
export default async function ProfileContactPage() {
  const { user } = await faitsDuSommaire();
  return (
    <SectionDuProfil section="coordonnees">
      <ProfileContactSection user={user} />
    </SectionDuProfil>
  );
}
