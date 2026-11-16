import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ProfileAgentDirectorySection } from '@/components/profile/ProfileAgentDirectorySection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { faitsPublicsDeLaFiche } from '@/lib/profil/faits-publics-de-la-fiche';
import { profilDAgent } from '@/lib/profil/sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('fiche') };
}

/**
 * TCK-2635 — « Fiche publique » de l'agent : ses langues et ses quartiers (TCK-2518, TCK-2524).
 * TCK-2862 — la jauge de complétude et l'aperçu de la carte publique : le compte (nom, photo,
 * présentation, téléphone vérifié) et, si la fiche est listée, ses faits publics (note, délai, biens).
 * Jamais le courriel : la carte publique ne le montre pas.
 */
export default async function ProfilePublicProfilePage() {
  const [{ user, profils }, locale] = await Promise.all([faitsDuSommaire(), getLocale()]);
  const faitsPublics = await faitsPublicsDeLaFiche(profilDAgent(profils)?.public_slug, locale);
  return (
    <SectionDuProfil section="fiche">
      <ProfileAgentDirectorySection
        compte={{
          nom: user.full_name,
          photo: user.avatar_url,
          presentation: user.bio,
          telephoneVerifie: Boolean(user.phone && user.phone_verified_at),
        }}
        faitsPublics={faitsPublics}
      />
    </SectionDuProfil>
  );
}
