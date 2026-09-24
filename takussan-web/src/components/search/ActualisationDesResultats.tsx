'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * « Mise à jour des biens… » — l'annonce qui tient l'attente d'une recherche publique (TCK-580).
 *
 * Retour testeur : cliquer une puce ne montrait rien, puis la grille pâlissait sans un mot. La
 * pastille dit CE qui charge, à l'endroit où l'œil attend la réponse : elle se pose en tête de la
 * grille et, si l'on a défilé, reste accrochée sous la barre de navigation (`sticky`).
 *
 * · **Hauteur nulle dans le flux** (`h-0`) : elle flotte au-dessus des premières cartes sans
 *   pousser la grille. Une annonce qui décale ce qu'elle annonce ferait sauter la page deux fois
 *   par clic — à l'apparition, puis au retrait.
 * · **Encre inversée** (`bg-foreground text-background`), la même que « Publier » : c'est le seul
 *   élément de l'écran qui n'est pas estompé pendant l'attente, et il doit se lire sur des photos.
 * · **Apparition différée** (`animate-pastille-actualisation`, 140 ms) : une réponse rapide ne la
 *   fait pas clignoter.
 * · `aria-hidden` : la rangée d'outils annonce déjà le chargement (`aria-live`), et la grille
 *   porte `aria-busy`. La pastille est pour l'œil.
 *
 * Les décalages `top-*` suivent la `nav` fixe : 68 px sous `lg`, 136 px au-dessus (bande des
 * catégories comprise), plus 12 px d'air.
 */
export function ActualisationDesResultats() {
  const t = useTranslations('search.results');
  return (
    <div
      aria-hidden
      data-actualisation="pastille"
      className="pointer-events-none sticky top-20 z-30 flex h-0 justify-center lg:top-[148px]"
    >
      <span className="animate-pastille-actualisation mt-3 inline-flex h-10 items-center gap-2.5 whitespace-nowrap rounded-full bg-foreground pl-3.5 pr-4 text-sm font-semibold text-background shadow-lg">
        <Loader2 className="size-4 animate-spin" />
        {t('updating')}
      </span>
    </div>
  );
}
