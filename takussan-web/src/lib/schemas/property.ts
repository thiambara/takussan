import { z } from 'zod';
import { requiredStringSchema } from './common';
import { msgValidation } from './messages';
import {
  propertyTypeValues,
  contractTypeValues,
  propertyStatusValues,
  propertyVisibilityValues,
  currencyValues,
  rentPeriodValues,
  titleTypeValues,
  conditionValues,
  newBuildConditionValues,
} from '@/lib/enums/property';

/**
 * Property-related Zod schemas used by the agent dashboard CRUD flows
 * (TCK-041). Kept as a strict subset of the backend validation rules —
 * the Laravel FormRequest is the source of truth, the client is UX polish.
 *
 * See `docs/models-spec.md#3-property` and `docs/spatie-query-builder.md`
 * for the authoritative field list.
 */

// TCK-744 — les listes de valeurs vivent dans `@/lib/enums/property`, sans dépendance ; réexportées
// ici pour les formulaires. Un composant d'affichage les importe de là-bas, jamais d'ici.
export {
  propertyTypeValues,
  contractTypeValues,
  propertyStatusValues,
  propertyVisibilityValues,
  currencyValues,
  rentPeriodValues,
  titleTypeValues,
  conditionValues,
  newBuildConditionValues,
};

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
  // TCK-633 — les identifiants du référentiel (ADR-0062). Le TEXTE reste la valeur affichée et
  // envoyée ; l'identifiant le PRÉCISE quand la saisie est un choix de la liste, et vaut `null`
  // dès qu'on retape. La région ne part pas (l'adresse n'a pas de colonne pour elle) : elle ne
  // sert qu'à restreindre la liste des villes.
  geo_region_id: z.number().int().positive().nullable().optional(),
  geo_city_id: z.number().int().positive().nullable().optional(),
  geo_neighborhood_id: z.number().int().positive().nullable().optional(),
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
  // TCK-633 — les équipements saisis hors du catalogue : des PROPOSITIONS, créées en attente
  // (`TagProposals`). Même chemin que `tag_ids` : `PUT …/tags`, jamais le corps du bien.
  tag_names: z.array(z.string().trim().min(1).max(100)).default([]),
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
