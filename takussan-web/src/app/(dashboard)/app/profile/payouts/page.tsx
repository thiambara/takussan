import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PayoutMethodsSection } from '@/components/profile/PayoutMethodsSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('versement') };
}

/** TCK-2635 — « Moyens de versement » du bailleur et du prestataire (TCK-594, sous double authentification). */
export default async function ProfilePayoutsPage() {
  return (
    <SectionDuProfil section="versement">
      <PayoutMethodsSection />
    </SectionDuProfil>
  );
}
