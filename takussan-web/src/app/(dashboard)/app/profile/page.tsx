import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { AReglerDuProfil } from '@/components/profile/sommaire/AReglerDuProfil';
import { detailsDuSommaire } from '@/components/profile/sommaire/details-du-sommaire';
import { MenuEtAffichage } from '@/components/profile/sommaire/MenuEtAffichage';
import { MesEspacesEnBref } from '@/components/profile/sommaire/MesEspacesEnBref';
import { identiteDuSommaire } from '@/lib/profil/identite-du-sommaire';
import { noteDeLaFiche } from '@/lib/profil/note-de-la-fiche';
import { SommaireDuTelephone } from '@/components/profile/sommaire/SommaireDuTelephone';
import type { Locale } from '@/i18n/config';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { aRegler, rangeesAPoint, rangeesDuSommaire } from '@/lib/profil/sommaire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.profile');
  return { title: t('metaTitle') };
}

/**
 * TCK-2635 — le profil s'ouvre sur son sommaire (maquette `app-profil` a, « Sommaire »).
 *
 * - Au téléphone : l'identité, « À régler », puis une rangée par section, qui ouvre sa page ; en
 *   dernier, « Supprimer mon compte » et « Déconnexion ».
 * - Au bureau : la « Vue d'ensemble », à droite du sommaire collant (`CadreDuProfil`) — l'identité,
 *   « À régler », mes espaces en bref, et « Menu et affichage » (barre latérale, menu, langue, fuseau).
 *
 * Chaque section d'avant le ticket a sa rangée et sa page (`/app/profile/*`, `/app/account/privacy`).
 */
export default async function ProfilePage() {
  const faits = await faitsDuSommaire();
  const [tDetails, tTypes, locale] = await Promise.all([
    getTranslations('profile.sommaire.details'),
    getTranslations('profile.types'),
    getLocale(),
  ]);
  const rangees = rangeesDuSommaire(faits);
  const liste = aRegler(faits);
  const note = await noteDeLaFiche(faits, locale);
  const details = detailsDuSommaire(faits, {
    t: (cle, valeurs) => tDetails(cle, valeurs),
    tTypes: (cle) => tTypes(cle),
    locale: locale as Locale,
    note,
  });

  const identite = identiteDuSommaire(faits, (type) => tTypes(type));

  return (
    <PagePleineLargeur data-slot="sommaire-du-profil-page" className="grid gap-6 max-md:gap-0">
      <div className="grid gap-6 max-md:gap-4 max-md:px-4 max-md:pt-5 max-md:pb-4">
        <ProfileHeader user={faits.user} fonction={identite.fonction} fiche={identite.fiche} />
        <AReglerDuProfil liste={liste} />
      </div>

      <SommaireDuTelephone rangees={rangees} points={rangeesAPoint(liste)} details={details} />

      {/* Au bureau, la vue d'ensemble (maquette `ASommaireBureau`) ; chacun de ces blocs a aussi sa page,
          ouverte du sommaire. */}
      <div className="grid gap-6 max-md:hidden">
        <MesEspacesEnBref profils={faits.profils} profilActif={faits.profilActif} />
        <MenuEtAffichage timezone={faits.user.timezone} />
      </div>
    </PagePleineLargeur>
  );
}
