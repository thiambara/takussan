import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileCustomerSection } from '@/components/profile/ProfileCustomerSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('recherche') };
}

/** TCK-2635 — « Préférences de recherche » du client (TCK-492 : au compte qui n'est QUE client). */
export default async function ProfileSearchPreferencesPage() {
  const { user } = await faitsDuSommaire();
  return (
    <SectionDuProfil section="recherche">
      <ProfileCustomerSection user={user} />
    </SectionDuProfil>
  );
}
