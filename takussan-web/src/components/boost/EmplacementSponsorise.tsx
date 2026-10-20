'use client';

import { useTranslations } from 'next-intl';

import { PropertyCard } from '@/components/property/PropertyCard';
import type { PropertyListItem } from '@/types/property';
import { ArriveeSponsorisee } from './arrivee-sponsorisee';
import { badgeDe } from './lecture-recherche';

export interface EmplacementsSponsorisesProps {
  readonly biens: readonly PropertyListItem[];
  readonly sizes?: string;
  /**
   * TCK-1036 — combien des premiers emplacements sont `priority`. Ils sont rendus en tête de la
   * grille appelante : sans `priority`, `PropertyCard` sort du rendu serveur en `opacity-0`
   * jusqu'à l'hydratation, et la première carte visible ne compte pas pour le LCP.
   */
  readonly prioritaires?: number;
}

/**
 * TCK-633 lot F (ADR-0061 §7) — les emplacements « Sponsorisé » en tête de page, HORS pagination et
 * hors `total`.
 *
 * TCK-635 (retours du porteur du 2026-10-12) — ils entrent DANS la grille des résultats, à la taille
 * des autres cartes, et se distinguent par leur robe (`PropertyCard robe="sponsorise"`) et non plus
 * par une étiquette posée au-dessus. D'où `contents` sur la section et la liste : elles gardent leur
 * sémantique (une région nommée, une liste), et chaque `<li>` devient une cellule de la grille
 * appelante. ⚠ Ce composant se rend donc DANS une grille.
 */
export function EmplacementsSponsorises({ biens, sizes, prioritaires = 0 }: EmplacementsSponsorisesProps) {
  const t = useTranslations('search.sponsored');
  if (biens.length === 0) return null;

  return (
    <section aria-label={t('label')} className="contents">
      {/* TCK-794 — le lien de chaque carte porte le marqueur d'arrivée `?src=sponsored`. */}
      <ArriveeSponsorisee value>
        <ul role="list" className="contents">
          {biens.map((bien, i) => (
            <li key={bien.id} data-emplacement="sponsorise">
              <PropertyCard
                property={bien}
                index={i}
                priority={i < prioritaires}
                sizes={sizes}
                robe="sponsorise"
                badge={badgeDe(bien)}
              />
            </li>
          ))}
        </ul>
      </ArriveeSponsorisee>
    </section>
  );
}
