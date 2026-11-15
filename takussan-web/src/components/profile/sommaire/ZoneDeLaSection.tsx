'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { RANGEES_LARGES, rangeeDuChemin } from '@/lib/profil/sommaire';
import { cn } from '@/lib/utils';

/**
 * TCK-2635 — la colonne de la section, à droite du sommaire : 640 px, 840 pour ce qui se lit en large
 * (la matrice des notifications, les avis, la fiche et son aperçu — maquette `PageProfilBureau large`).
 * En `rem` FIXES, comme la maquette les pose en px : la densité du bureau (×0,9) ne les rétrécit pas.
 * Au téléphone, toute la largeur.
 */
export function ZoneDeLaSection({ children }: { readonly children: ReactNode }) {
  const rangee = rangeeDuChemin(usePathname());
  const large = rangee !== null && RANGEES_LARGES.has(rangee);
  return (
    <div data-slot="zone-de-la-section" className={cn('min-w-0 flex-1', large ? 'md:max-w-[52.5rem]' : 'md:max-w-[40rem]')}>
      {children}
    </div>
  );
}
