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
 * TCK-508 — `PropertyCondition` côté backend, dans l'ordre de l'enum. Le vocabulaire
 * (`property.conditions`) est tenu aligné sur `lang/<locale>/properties.php` par
 * `property-labels.parity.test.ts`.
 */
export const conditionValues = ['off_plan', 'new', 'renovated', 'good', 'to_renovate'] as const;

/** Les deux états qui sont un argument de vente, et les seuls à porter un badge public. */
export const newBuildConditionValues = ['off_plan', 'new'] as const satisfies readonly (typeof conditionValues)[number][];

/**
 * TCK-598 (V9) — les bornes du coût d'entrée, celles de `CoutDEntree::regles()` côté API : mois de
 * 0 à 24, montants positifs, deux décimales au plus pour les frais (« ½ mois »).
 */
export const ENTRY_COST_MONTHS_MAX = 24;

/**
 * Un champ numérique FACULTATIF : vide (`''`, `null`) → absent. `z.coerce` lirait `''` comme 0,
 * ce qui déclarerait « 0 mois de caution » à qui n'a rien saisi — une information, et fausse.
 */
function nombreFacultatif(schema: z.ZodNumber) {
  return z.preprocess(
    (v) => {
      if (v === null || v === undefined) return undefined;
      if (typeof v === 'string') return v.trim() === '' ? undefined : Number(v.replace(',', '.'));
      return v;
    },
    schema.optional(),
  );
}

const moisDEntree = () =>
  nombreFacultatif(
    z
      .number({ error: msgValidation('property.valueInvalid') })
      .int(msgValidation('property.integerExpected'))
      .min(0, msgValidation('property.valueInvalid'))
      .max(ENTRY_COST_MONTHS_MAX, msgValidation('property.valueUnrealistic')),
  );

/**
 * TCK-598 (V19) — l'URL de la visite virtuelle : `https` seulement. La liste des HÔTES admis vit
 * côté API (configuration) et n'est pas recopiée ici : un 422 la rappelle, sous le champ.
 */
const urlDeVisite = z
  .string()
  .trim()
  .max(2048, msgValidation('property.virtualTourInvalid'))
  .optional()
  .or(z.literal(''))
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .refine((v) => {
    if (v === undefined) return true;
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, msgValidation('property.virtualTourInvalid'));

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
  // TCK-564 — le prix se saisit dans `FormAmountInput`, qui remet un champ VIDÉ en `null`.
  // `z.coerce.number` lit `null` (et `''`) comme 0, et l'écran disait « doit être supérieur à 0 »
  // à qui venait d'effacer le prix : le vide redevient `undefined`, que la coercition refuse
  // comme ABSENT (`NaN`) — d'où « Le prix est requis. ». 0 saisi reste « supérieur à 0 ».
  price: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z.coerce
      .number({ error: msgValidation('property.priceRequired') })
      .positive(msgValidation('property.pricePositive'))
      .max(1_000_000_000_000, msgValidation('property.priceUnrealistic')),
  ),
  currency: z.enum(currencyValues).default('XOF'),
  rent_period: z.enum(rentPeriodValues).optional(),
  title_type: z.enum(titleTypeValues).optional(),
  // TCK-508 — `''` est l'option « Non précisé » du formulaire d'édition : elle part en `null`, ce
  // qui EFFACE en base. Omise, la clé laisserait l'ancien état en place sans que l'écran le montre.
  condition: z
    .union([z.enum(conditionValues), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
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
  // TCK-598 (V9) — le coût d'entrée d'une location mensuelle. Hors de ce cas, l'API rend 422 :
  // la matrice de pertinence (`field-matrix.ts`) les retire du corps avant l'envoi.
  deposit_months: moisDEntree(),
  advance_months: moisDEntree(),
  agency_fee_months: nombreFacultatif(
    z
      .number({ error: msgValidation('property.valueInvalid') })
      .min(0, msgValidation('property.valueInvalid'))
      .max(ENTRY_COST_MONTHS_MAX, msgValidation('property.valueUnrealistic'))
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, msgValidation('property.valueInvalid')),
  ),
  monthly_charges: nombreFacultatif(
    z
      .number({ error: msgValidation('property.valueInvalid') })
      .min(0, msgValidation('property.valueInvalid'))
      .max(999_999_999_999, msgValidation('property.valueUnrealistic')),
  ),
  virtual_tour_url: urlDeVisite,
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
