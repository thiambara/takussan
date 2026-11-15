import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileSecuritySection } from '@/components/profile/ProfileSecuritySection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('securite') };
}

/** TCK-2635 — « Sécurité » : double authentification, téléphone, courriel, sessions actives. */
export default async function ProfileSecurityPage() {
  return (
    <SectionDuProfil section="securite">
      <ProfileSecuritySection />
    </SectionDuProfil>
  );
}
