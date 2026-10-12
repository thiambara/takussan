import type { PropertyListItem } from '@/types/property';

export type CardVariant = 'standard' | 'cover' | 'listing' | 'compact';

export interface PropertyCardCommonProps {
  readonly property: PropertyListItem;
  /** 0-based index — drives stagger entrance animation-delay. */
  readonly index?: number;
  /** Mark the 1-2 above-the-fold cards as priority for next/image LCP. */
  readonly priority?: boolean;
  /**
   * `sizes` de `next/image`. Le défaut de chaque variante décrit sa largeur NATIVE ;
   * toute surface qui étire la carte (`w-full`, colonne de grille) doit passer le
   * sien — cf. `card-image-sizes.ts`, qui porte les relevés.
   */
  readonly sizes?: string;
  /**
   * TCK-635 — la robe d'une Vedette (ADR-0061 §5, §7) : même carte, même taille, une couleur et une
   * mention. Seule la variante Cover la dessine aujourd'hui (rangée « Sélection de la semaine ») ;
   * la carte de la recherche porte la sienne (`PropertyCard`).
   */
  readonly robe?: 'vedette';
}
