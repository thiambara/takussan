import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { aRegler, rangeesAPoint, rangeesDuSommaire } from '@/lib/profil/sommaire';
import { SommaireDuBureau } from './SommaireDuBureau';
import { ZoneDeLaSection } from './ZoneDeLaSection';

/**
 * TCK-2635 — le cadre de toutes les pages du profil (`/app/profile/*` et `/app/account/privacy`) :
 * au bureau, l'en-tête « Profil » (et ce qui demande l'attention), le sommaire collant à gauche et la
 * section à droite (maquette `PageProfilBureau`). Au téléphone, rien de tout cela : la page de section
 * est un détail sous l'en-tête de la coque (TCK-2617), le sommaire est la page `/app/profile`.
 *
 * L'en-tête n'est pas `PageHeader` : celui-ci DÉCLARE son titre à l'en-tête du téléphone, et une page
 * de section y porte le sien (« Coordonnées »), pas « Profil ».
 */
export async function CadreDuProfil({ children }: { readonly children: ReactNode }) {
  const [t, faits] = await Promise.all([getTranslations('profile.sommaire'), faitsDuSommaire()]);
  const rangees = rangeesDuSommaire(faits);
  const liste = aRegler(faits);
  const points = [...rangeesAPoint(liste)];

  return (
    <div data-slot="cadre-du-profil">
      <header className="max-md:hidden">
        <h1 className="font-display text-2xl font-semibold tracking-titre text-balance text-foreground">{t('titre')}</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {liste.length > 0 ? t('attention', { count: liste.length }) : t('sansAttention')}
        </p>
      </header>
      <div className="flex flex-col gap-6 md:pt-6 xl:flex-row xl:items-start xl:gap-10">
        <SommaireDuBureau rangees={rangees} points={points} />
        <ZoneDeLaSection>{children}</ZoneDeLaSection>
      </div>
    </div>
  );
}
