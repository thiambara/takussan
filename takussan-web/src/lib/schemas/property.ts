import { z } from 'zod';
import { requiredStringSchema } from './common';
import { msgValidation } from './messages';

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
 * TCK-464 — `TitleType` côté backend. ⚠ La quatrième valeur est `'autre'` et non `'other'` :
 * `src/types/property.ts` écrivait `'other'`, une valeur que l'API n'a jamais pu émettre. Le
 * défaut était invisible tant qu'aucun écran n'écrivait ni ne discriminait `title_type`.
 */
export const titleTypeValues = ['bail', 'titre_foncier', 'deliberation', 'autre'] as const;

/**
 * Input for the create / edit property form. All fields are required by
 * UX (per TCK-041 AC) except the optional descriptors.
 * TCK-120 adds: address fields, year_built, parking_spaces, tag_ids.
 */
export const propertyFormSchema = z.object({
  title: requiredStringSchema(msgValidation('property.titleRequired')).max(
    200,
    msgValidation('property.titleTooLong'),
  ),
  type: z.enum(propertyTypeValues, {
    error: msgValidation('property.typeRequired'),
  }),
  contract_type: z.enum(contractTypeValues, {
    error: msgValidation('property.contractTypeRequired'),
  }),
  price: z.coerce
    .number({ error: msgValidation('property.priceRequired') })
    .positive(msgValidation('property.pricePositive'))
    .max(1_000_000_000_000, msgValidation('property.priceUnrealistic')),
  currency: z.enum(currencyValues).default('XOF'),
  rent_period: z.enum(rentPeriodValues).optional(),
  title_type: z.enum(titleTypeValues).optional(),
  available_from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msgValidation('property.dateInvalid'))
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  city: requiredStringSchema(msgValidation('property.cityRequired')).max(120, msgValidation('property.cityTooLong')),
  quarter: z
    .string()
    .trim()
    .max(120, msgValidation('property.quarterTooLong'))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  region: z
    .string()
    .trim()
    .max(120, msgValidation('property.regionTooLong'))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  street: z
    .string()
    .trim()
    .max(255, msgValidation('property.streetTooLong'))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  postal_code: z
    .string()
    .trim()
    .max(20, msgValidation('property.postalCodeTooLong'))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  country: z
    .string()
    .trim()
    .length(2, msgValidation('property.countryLength'))
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.length === 2 ? v : undefined)),
  latitude: z.coerce
    .number()
    .min(-90, msgValidation('property.latitudeInvalid'))
    .max(90, msgValidation('property.latitudeInvalid'))
    .nullable()
    .optional(),
  longitude: z.coerce
    .number()
    .min(-180, msgValidation('property.longitudeInvalid'))
    .max(180, msgValidation('property.longitudeInvalid'))
    .nullable()
    .optional(),
  area: z.coerce
    .number()
    .int(msgValidation('property.areaInteger'))
    .positive(msgValidation('property.areaPositive'))
    .max(1_000_000, msgValidation('property.areaUnrealistic'))
    .optional(),
  bedrooms: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(0, msgValidation('property.valueInvalid'))
    .max(100, msgValidation('property.valueUnrealistic'))
    .optional(),
  bathrooms: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(0, msgValidation('property.valueInvalid'))
    .max(100, msgValidation('property.valueUnrealistic'))
    .optional(),
  furnished: z.boolean().default(false),
  year_built: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(1800, msgValidation('property.yearInvalid'))
    .max(2100, msgValidation('property.yearInvalid'))
    .optional(),
  parking_spaces: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(0, msgValidation('property.valueInvalid'))
    .max(500, msgValidation('property.valueUnrealistic'))
    .optional(),
  floor_number: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(-5, msgValidation('property.valueInvalid'))
    .max(200, msgValidation('property.valueUnrealistic'))
    .optional(),
  total_floors: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(1, msgValidation('property.valueInvalid'))
    .max(200, msgValidation('property.valueUnrealistic'))
    .optional(),
  description: z
    .string()
    .trim()
    .max(10_000, msgValidation('property.descriptionTooLong'))
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
    error: msgValidation('property.statusInvalid'),
  }),
});

export type PropertyStatusChangeValues = z.infer<typeof propertyStatusChangeSchema>;
