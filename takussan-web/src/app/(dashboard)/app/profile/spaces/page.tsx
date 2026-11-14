import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyProfilesSection } from '@/components/profile/MyProfilesSection';
import { ProfileAdminSection } from '@/components/profile/ProfileAdminSection';
import { ProfileOwnerSection } from '@/components/profile/ProfileOwnerSection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { isAdmin, isOwner } from '@/lib/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('espaces') };
}

/**
 * TCK-2635 — « Mes espaces » : une carte par profil (agence, rôle, statut, profil actif, KYC), puis ce
 * que chaque rôle d'agence y ajoutait sur l'ancienne page — l'administration de l'agence (admin) et
 * l'espace du bailleur.
 */
export default async function ProfileSpacesPage() {
  const { user } = await faitsDuSommaire();
  return (
    <SectionDuProfil section="espaces">
      <div className="grid gap-6">
        <MyProfilesSection />
        {isOwner(user.roles) && <ProfileOwnerSection user={user} />}
        {isAdmin(user.roles) && <ProfileAdminSection user={user} />}
      </div>
    </SectionDuProfil>
  );
}
