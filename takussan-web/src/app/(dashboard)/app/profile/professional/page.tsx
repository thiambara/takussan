import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileAgentSection } from '@/components/profile/ProfileAgentSection';
import { ProfileServiceProviderSection } from '@/components/profile/ProfileServiceProviderSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { isAgent, isServiceProvider } from '@/lib/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('pro') };
}

/**
 * TCK-2635 — « Profil professionnel » : l'agent (agence liée, carte professionnelle, spécialité) et le
 * prestataire (métiers, zones, tarifs, disponibilités — TCK-592), chacun ce qui le concerne.
 */
export default async function ProfileProfessionalPage() {
  const { user } = await faitsDuSommaire();
  return (
    <SectionDuProfil section="pro">
      <div className="grid gap-6">
        {isAgent(user.roles) && <ProfileAgentSection />}
        {isServiceProvider(user.roles) && <ProfileServiceProviderSection />}
      </div>
    </SectionDuProfil>
  );
}
