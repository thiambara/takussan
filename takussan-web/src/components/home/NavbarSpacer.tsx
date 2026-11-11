'use client';

import { usePathname } from 'next/navigation';
import { BandeauxDuSite } from '@/components/announcements/BandeauxDuSite';
import { enTeteAuTelephone, estPageDeDecouverte, type EnTeteAuTelephone } from '@/lib/navigation/barre-publique';
import { cn } from '@/lib/utils';

/**
 * La cale sous la `Navbar` fixe du site public — sa hauteur RÉELLE à chaque palier.
 *
 * Chaque page posait `h-[133px]`, la hauteur de la barre de bureau (recherche + rangée de
 * catégories). Or la barre ne passe en bureau qu'à `lg` (TCK-505) : en dessous elle ne mesurait
 * que 67 px, et les pages ouvraient sur 66 px de vide en plus de leur propre marge — mesuré à 360,
 * 390 et 768 px le 2026-09-16 (`h1` à 181 px). Relevé après la revue du même jour, la pastille de
 * recherche mobile passant à 44 px : 69 px sous `lg`, 136 px en bureau.
 *
 * TCK-2494 (ADR-0091 §5) — en bureau, la rangée de catégories ne reste que sur les pages de
 * DÉCOUVERTE (accueil, liste) : ailleurs, la barre tient sur une ligne, et la cale la suit. Même
 * prédicat que la barre (`estPageDeDecouverte`), sur le même chemin : les deux ne peuvent pas
 * diverger. Hors découverte, la barre mesure sa pilule de 52 px, son `py-3` et sa bordure : 77 px à
 * 1024, 74,6 à 1440 où l'échelle du bureau réduit le `rem` (mesuré le 2026-11-09) — d'où un `calc`
 * plutôt qu'une valeur figée.
 *
 * TCK-572 — c'est aussi l'EMPLACEMENT des bandeaux du site sur les pages publiques : juste sous la
 * cale, donc juste sous la barre, dans le flux de la page. Rendus par le layout racine, ils
 * passaient SOUS la barre fixe (invisibles, leur croix sous le bouton menu) et poussaient la page
 * de leur hauteur. Toutes les pages qui montent la `Navbar` montent cette cale.
 *
 * TCK-2568 — sous `lg`, là où la barre du site cède la place à l'en-tête de la page
 * (`enTeteAuTelephone`), la cale tombe à zéro : la barre n'est pas là, rien n'est à réserver. Même
 * prédicat, même chemin, même surcharge (`auTelephone`) que la `Navbar` : les deux ne divergent pas.
 */
export function NavbarSpacer({ auTelephone }: { readonly auTelephone?: EnTeteAuTelephone } = {}) {
  const pathname = usePathname();
  const decouverte = estPageDeDecouverte(pathname);
  const enTete = auTelephone ?? enTeteAuTelephone(pathname);
  // Sous `lg` : rien sans barre ; 57 px sous la barre de marque (56 + bordure) ; 69 sinon.
  const auTelephoneHauteur = enTete === 'en-tete-de-page' ? 'h-0' : enTete === 'marque' ? 'h-[57px]' : 'h-[69px]';
  return (
    <>
      <div
        aria-hidden="true"
        data-cale-navbar=""
        data-decouverte={decouverte ? '' : undefined}
        className={cn(auTelephoneHauteur, 'lg:h-[calc(var(--spacing)*6+53px)] lg:data-decouverte:h-[136px]')}
      />
      <BandeauxDuSite emplacement="page" />
    </>
  );
}
