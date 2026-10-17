/**
 * Les VALEURS des énumérations de bien, sans aucune dépendance — TCK-744 (P33.03).
 *
 * ⚠ **Ce module n'importe rien, et c'est sa raison d'être.** Ces listes vivaient dans
 * `@/lib/schemas/property`, qui commence par `import { z } from 'zod'` et construit ses schémas au
 * chargement : une carte de bien qui n'en lisait qu'une liste pour traduire un libellé faisait
 * entrer zod (64 Kio gzip) dans le JS initial de l'accueil, de la recherche et de la fiche.
 * Un composant d'affichage importe ICI ; `@/lib/schemas/property` les réexporte pour les
 * formulaires. Garde : `src/app/[locale]/(public)/__tests__/zod-hors-des-pages-publiques.test.ts`.
 */

export const propertyTypeValues = [
  'land',
  'house',
  'apartment',
  'villa',
  'studio',
  'room',
  'office',
  'shop',
  'warehouse',
  'factory',
  'farm',
  'hotel',
  'resort',
  'garage',
  'parking',
  'other',
] as const;

export const contractTypeValues = ['sale', 'rent'] as const;

export const propertyStatusValues = [
  'draft',
  'available',
  'sold',
  'rented',
  'under_maintenance',
  'unavailable',
  'pending',
  'archived',
] as const;

export const propertyVisibilityValues = ['public', 'private'] as const;

export const currencyValues = ['XOF', 'XAF', 'EUR', 'USD'] as const;

export const rentPeriodValues = ['daily', 'weekly', 'monthly', 'yearly'] as const;

/**
 * TCK-464 — `TitleType` côté backend. ⚠ La quatrième valeur est `'autre'` et non `'other'` :
 * `src/types/property.ts` écrivait `'other'`, une valeur que l'API n'a jamais pu émettre. Le
 * défaut était invisible tant qu'aucun écran n'écrivait ni ne discriminait `title_type`.
 */
export const titleTypeValues = ['bail', 'titre_foncier', 'deliberation', 'autre'] as const;

/**
 * TCK-508 — `PropertyCondition` côté backend, dans l'ordre de l'enum. Le vocabulaire
 * (`property.conditions`) est tenu aligné sur `lang/<locale>/properties.php` par
 * `property-labels.parity.test.ts`.
 */
export const conditionValues = ['off_plan', 'new', 'renovated', 'good', 'to_renovate'] as const;

/** Les deux états qui sont un argument de vente, et les seuls à porter un badge public. */
export const newBuildConditionValues = ['off_plan', 'new'] as const satisfies readonly (typeof conditionValues)[number][];
