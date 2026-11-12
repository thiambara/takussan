import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SuppressionDuCompte } from '@/components/profile/security/SuppressionDuCompte';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire');
  return { title: t('supprimer') };
}

/**
 * TCK-2635 — « Supprimer mon compte », en dernier du sommaire et jamais au milieu : derrière ses
 * confirmations d'avant le ticket (double authentification si active, délai de grâce de 30 jours).
 */
export default async function ProfileDeleteAccountPage() {
  return (
    <SectionDuProfil section="suppression">
      <SuppressionDuCompte />
    </SectionDuProfil>
  );
}
