import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PayoutMethodsSection } from '@/components/profile/PayoutMethodsSection';
import { ProfileDirectorySection } from '@/components/profile/ProfileDirectorySection';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { rangeesDuSommaire } from '@/lib/profil/sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile.sommaire.rangees');
  return { title: t('versement') };
}

/**
 * TCK-2635 — « Moyens de versement » du bailleur et du prestataire (TCK-594, sous double authentification).
 *
 * TCK-2864 — au bureau, la page du bailleur RÉUNIT versement et « Annuaire public » (maquette
 * `ABailleurBureau`) : le bloc de l'annuaire suit, ancré `#annuaire` (l'entrée du sommaire du bureau y
 * mène). Au téléphone, l'annuaire garde sa page (`/app/profile/directory`) : le bloc n'y est pas rendu.
 * Seulement pour qui a la rangée de l'annuaire (pas le prestataire, ni le bailleur aussi agent).
 */
export default async function ProfilePayoutsPage() {
  const faits = await faitsDuSommaire();
  const annuaire = rangeesDuSommaire(faits).includes('annuaire');
  return (
    <SectionDuProfil section="versement">
      <PayoutMethodsSection />
      {annuaire ? (
        <div id="annuaire" data-slot="annuaire-au-bureau" className="mt-8 scroll-mt-6 max-md:hidden">
          <ProfileDirectorySection listed={faits.user.listed_in_public_directory === true} />
        </div>
      ) : null}
    </SectionDuProfil>
  );
}
