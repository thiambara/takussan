import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { rangeesDuSommaire, type IdDeRangee } from '@/lib/profil/sommaire';

interface SectionDuProfilProps {
  /** La rangée que la page ouvre ; `suppression` : « Supprimer mon compte », qui n'est pas une rangée. */
  readonly section: IdDeRangee | 'suppression';
  readonly children: ReactNode;
}

/**
 * TCK-2635 — une page de section du profil : au bureau, son titre et son aide à droite du sommaire
 * (maquette `PageProfilBureau`, `titreSection`) ; au téléphone, rien — le titre est celui de l'en-tête
 * de détail de la coque (TCK-2617), et la flèche ramène au sommaire.
 *
 * Une section que le compte n'a pas (la fiche publique d'un bailleur) rend 404 : son adresse n'est ni
 * un lien du sommaire, ni une page vide.
 */
export async function SectionDuProfil({ section, children }: SectionDuProfilProps) {
  if (section !== 'suppression' && !rangeesDuSommaire(await faitsDuSommaire()).includes(section)) notFound();
  const t = await getTranslations('profile.sommaire');
  return (
    <section aria-labelledby="titre-de-la-section" data-slot="section-du-profil" data-section={section}>
      <div className="mb-5 max-md:sr-only">
        <h2 id="titre-de-la-section" className="font-display text-xl font-semibold tracking-titre">
          {section === 'suppression' ? t('supprimer') : t(`rangees.${section}`)}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(`aides.${section}`)}</p>
      </div>
      {children}
    </section>
  );
}
