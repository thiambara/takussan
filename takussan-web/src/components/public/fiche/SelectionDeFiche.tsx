import { PropertyCard } from '@/components/property/PropertyCard';
import type { PropertyListItem } from '@/types/property';

export interface SelectionDeFicheProps {
  readonly biens: readonly PropertyListItem[];
  readonly titre: string;
  readonly idTitre: string;
}

/**
 * TCK-2522 — « La sélection de l'agence » (`showcase`, TCK-2518) : les biens qu'elle a choisis,
 * dans son ordre, encore publics. Au téléphone, une rangée qui défile (on en voit une et demie, ce
 * qui dit qu'il y en a d'autres) ; en bureau, une grille de trois.
 *
 * Sans sélection, rien n'est rendu — ni titre, ni cadre vide (AC4).
 */
export function SelectionDeFiche({ biens, titre, idTitre }: SelectionDeFicheProps) {
  if (biens.length === 0) return null;
  return (
    <section aria-labelledby={idTitre} data-selection-de-fiche>
      <h2 id={idTitre} className="font-display text-lg font-semibold tracking-tight text-foreground lg:text-2xl">
        {titre}
      </h2>
      <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0">
        {biens.map((bien, i) => (
          <li key={bien.id} className="w-[232px] shrink-0 snap-start lg:w-auto">
            <PropertyCard
              property={bien}
              index={i}
              priority={i < 2}
              revelee
              hideCompare
              sizes="(max-width: 1023px) 232px, 22vw"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
