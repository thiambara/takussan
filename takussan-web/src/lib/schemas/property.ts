import { z } from 'zod';
import { requiredStringSchema } from './common';

/**
 * Property-related Zod schemas used by the agent dashboard CRUD flows
 * (TCK-041). Kept as a strict subset of the backend validation rules —
 * the Laravel FormRequest is the source of truth, the client is UX polish.
 *
 * See `docs/models-spec.md#3-property` and `docs/spatie-query-builder.md`
 * for the authoritative field list.
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
 * Input for the create / edit property form. All fields are required by
 * UX (per TCK-041 AC) except the optional descriptors.
 * TCK-120 adds: address fields, year_built, parking_spaces, tag_ids.
 */
export const propertyFormSchema = z.object({
  title: requiredStringSchema('Le titre est requis.').max(
    200,
    'Le titre est trop long (200 caractères max).',
  ),
  type: z.enum(propertyTypeValues, {
    error: 'Le type de bien est requis.',
  }),
  contract_type: z.enum(contractTypeValues, {
    error: 'Le type de contrat est requis.',
  }),
  price: z.coerce
    .number({ error: 'Le prix est requis.' })
    .positive('Le prix doit être supérieur à 0.')
    .max(1_000_000_000_000, 'Le prix est irréaliste.'),
  currency: z.enum(currencyValues).default('XOF'),
  rent_period: z.enum(rentPeriodValues).optional(),
  city: requiredStringSchema('La ville est requise.').max(120, 'La ville est trop longue.'),
  quarter: z
    .string()
    .trim()
    .max(120, 'Le quartier est trop long.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  region: z
    .string()
    .trim()
    .max(120, 'La région est trop longue.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  street: z
    .string()
    .trim()
    .max(255, 'La rue est trop longue.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  postal_code: z
    .string()
    .trim()
    .max(20, 'Le code postal est trop long.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  country: z
    .string()
    .trim()
    .length(2, 'Le code pays doit être sur 2 caractères (ex: SN).')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.length === 2 ? v : undefined)),
  latitude: z.coerce
    .number()
    .min(-90, 'Latitude invalide.')
    .max(90, 'Latitude invalide.')
    .nullable()
    .optional(),
  longitude: z.coerce
    .number()
    .min(-180, 'Longitude invalide.')
    .max(180, 'Longitude invalide.')
    .nullable()
    .optional(),
  area: z.coerce
    .number()
    .int('La superficie doit être un entier.')
    .positive('La superficie doit être supérieure à 0.')
    .max(1_000_000, 'La superficie est irréaliste.')
    .optional(),
  bedrooms: z.coerce
    .number()
    .int('Nombre entier attendu.')
    .min(0, 'Valeur invalide.')
    .max(100, 'Valeur irréaliste.')
    .optional(),
  bathrooms: z.coerce
    .number()
    .int('Nombre entier attendu.')
    .min(0, 'Valeur invalide.')
    .max(100, 'Valeur irréaliste.')
    .optional(),
  furnished: z.boolean().default(false),
  year_built: z.coerce
    .number()
    .int('Nombre entier attendu.')
    .min(1800, 'Année invalide.')
    .max(2100, 'Année invalide.')
    .optional(),
  parking_spaces: z.coerce
    .number()
    .int('Nombre entier attendu.')
    .min(0, 'Valeur invalide.')
    .max(500, 'Valeur irréaliste.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(10_000, 'La description est trop longue.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  tag_ids: z.array(z.number().int().positive()).default([]),
});

export type PropertyFormValues = z.input<typeof propertyFormSchema>;
export type PropertyFormPayload = z.output<typeof propertyFormSchema>;

/**
 * Helper for the quick status action — used by the list row dropdown.
 */
export const propertyStatusChangeSchema = z.object({
  status: z.enum(propertyStatusValues, {
    error: 'Statut invalide.',
  }),
});

export type PropertyStatusChangeValues = z.infer<typeof propertyStatusChangeSchema>;
