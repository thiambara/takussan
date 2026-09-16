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
}
