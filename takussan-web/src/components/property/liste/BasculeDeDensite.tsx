'use client';

import { useTranslations } from 'next-intl';
import { LayoutGrid, List } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ZONE_TACTILE_44 } from '@/lib/zone-tactile';
import { choisirDensite, type Densite } from './densite';

/**
 * TCK-2499 — Liste ou Galerie, en un geste. Un groupe de deux radios (icône seule, nom accessible
 * en toutes lettres), pastilles de 36 px (zone de toucher de 44, `ZONE_TACTILE_44`) dans un groupe de 40 : à 390 px, la rangée d'outils garde
 * au tri la place d'écrire « Pertinence » en entier (mesuré au navigateur, notes de TCK-2499).
 *
 * Téléphone seulement (`md:hidden` posé par l'appelant) : à partir de `md`, la liste est une grille
 * de cartes à plusieurs colonnes, et la densité n'y change rien.
 */
export function BasculeDeDensite({ densite, className }: { readonly densite: Densite; readonly className?: string }) {
  const t = useTranslations('search.results.densite');
  const options = [
    { valeur: 'liste', Icone: List },
    { valeur: 'galerie', Icone: LayoutGrid },
  ] as const;

  return (
    <div role="radiogroup" aria-label={t('aria')} className={cn('flex shrink-0 rounded-full bg-muted p-0.5', className)}>
      {options.map(({ valeur, Icone }) => {
        const actif = valeur === densite;
        return (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={t(valeur)}
            title={t(valeur)}
            onClick={() => choisirDensite(valeur)}
            className={cn(
              'grid size-9 place-items-center rounded-full transition-[background-color,color,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]',
              actif ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              ZONE_TACTILE_44,
            )}
          >
            <Icone className="size-[18px]" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
