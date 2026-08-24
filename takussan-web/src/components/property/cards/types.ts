import type { PropertyListItem, RentPeriod } from '@/types/property';

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

export const RENT_PERIOD_SHORT: Record<RentPeriod, string> = {
  daily: 'jour',
  weekly: 'sem.',
  monthly: 'mois',
  yearly: 'an',
};

/** Discrete fallback when `main_photo_url` is null in production. */
export const FALLBACK_IMAGE =
  'https://placehold.co/800x600/f1ece0/6e655a?text=Photo+%C3%A0+venir';
