import { z } from 'zod';
import { requiredStringSchema } from './common';
import { msgValidation } from './messages';

/**
 * Customer (CRM) Zod schemas — TCK-042. Source of truth:
 * `docs/models-spec.md#7-customer` + `docs/models-spec.md#33-customernote`.
 */

export const customerStatusValues = [
  'active',
  'inactive',
  'blocked',
  'deleted',
] as const;

export const pipelineStageValues = [
  'lead',
  'prospect',
  'qualified',
  'negotiating',
  'converted',
  'lost',
] as const;

export const idTypeValues = ['id_card', 'passport', 'driving_license'] as const;

/** TCK-591 §5 — vocabulaire de `ContractType` et `PropertyType` (API), celui de la recherche publique. */
export const seekingContractTypeValues = ['sale', 'rent'] as const;
export const seekingPropertyTypeValues = [
  'apartment', 'house', 'villa', 'studio', 'room', 'land', 'office', 'shop',
  'warehouse', 'factory', 'farm', 'hotel', 'resort', 'garage', 'parking', 'other',
] as const;

const montantOuVide = (v: string | undefined) =>
  v === undefined || v.trim() === '' || (/^\d+(?:[.,]\d{1,2})?$/.test(v.trim()));
const montant = (v: string | undefined): number | null =>
  v === undefined || v.trim() === '' ? null : Number(v.trim().replace(',', '.'));

/**
 * Create / edit form. `email` and `phone` are both optional at the schema
 * level (a prospect may exist without them); the cross-field check
 * "au moins un des deux" is enforced in `customerFormSchema.superRefine`.
 *
 * The schema is intentionally kept as a plain `ZodObject` (no chained
 * transforms) so the hook-form resolver typings stay compatible with
 * `useApiForm`. Raw values may be empty strings; they are normalised at
 * submit time via `normaliseCustomerForm`.
 */
export const customerFormSchema = z
  .object({
    first_name: requiredStringSchema(msgValidation('common.firstNameRequired')).max(
      100,
      msgValidation('common.firstNameTooLong'),
    ),
    last_name: requiredStringSchema(msgValidation('common.lastNameRequired')).max(
      100,
      msgValidation('common.lastNameTooLong'),
    ),
    email: z
      .string()
      .max(255, msgValidation('common.emailTooLong'))
      .refine(
        (v) => v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
        msgValidation('common.emailInvalid'),
      ),
    phone: z
      .string()
      .refine(
        (v) => v.trim() === '' || /^\+?[0-9\s().-]{8,20}$/.test(v.trim()),
        msgValidation('common.phoneInvalid'),
      ),
    occupation: z.string().max(120, msgValidation('customer.occupationTooLong')),
    pipeline_stage: z.enum(pipelineStageValues),
    status: z.enum(customerStatusValues),
    id_type: z.string().refine(
      (v) => v === '' || (idTypeValues as readonly string[]).includes(v),
      msgValidation('customer.idTypeInvalid'),
    ),
    id_number: z.string().max(64, msgValidation('customer.idNumberTooLong')),
    // TCK-591 §5 — critères du prospect. Facultatifs ici (le formulaire compact ne les montre
    // pas) ; un champ vide part en `null` et EFFACE le critère côté API.
    seeking_contract_type: z.string().optional().refine(
      (v) => !v || v === 'any' || (seekingContractTypeValues as readonly string[]).includes(v),
      msgValidation('agentCrm.criteriaInvalid'),
    ),
    budget_min: z.string().optional().refine(montantOuVide, msgValidation('agentCrm.budgetInvalid')),
    budget_max: z.string().optional().refine(montantOuVide, msgValidation('agentCrm.budgetInvalid')),
    seeking_property_types: z.array(z.string()).optional(),
    seeking_cities: z.string().max(2000).optional(),
    seeking_neighborhoods: z.string().max(3000).optional(),
    min_bedrooms: z.string().optional().refine(
      (v) => v === undefined || v.trim() === '' || (/^\d{1,2}$/.test(v.trim()) && Number(v) <= 50),
      msgValidation('agentCrm.bedroomsInvalid'),
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.email.trim() && !data.phone.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: msgValidation('customer.emailOrPhone'),
      });
    }
    const min = montantOuVide(data.budget_min) ? montant(data.budget_min) : null;
    const max = montantOuVide(data.budget_max) ? montant(data.budget_max) : null;
    if (min !== null && max !== null && max < min) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget_max'],
        message: msgValidation('agentCrm.budgetRange'),
      });
    }
    if (data.id_type && !data.id_number.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['id_number'],
        message: msgValidation('customer.idNumberRequired'),
      });
    }
  });

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export interface CustomerFormPayload {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  occupation?: string;
  pipeline_stage: (typeof pipelineStageValues)[number];
  status: (typeof customerStatusValues)[number];
  id_type?: (typeof idTypeValues)[number];
  id_number?: string;
  /** TCK-591 — `true` après un 409 `customer.duplicate` assumé (« Créer quand même »). */
  allow_duplicate?: boolean;
  seeking_contract_type?: (typeof seekingContractTypeValues)[number] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  seeking_property_types?: string[] | null;
  seeking_cities?: string[] | null;
  seeking_neighborhoods?: string[] | null;
  min_bedrooms?: number | null;
}

/** « Dakar, Thiès » → `['Dakar', 'Thiès']` ; vide → `null` (le critère est effacé). */
function liste(v: string | undefined): string[] | null {
  const items = (v ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return items.length > 0 ? Array.from(new Set(items)) : null;
}

/**
 * Normalise the UI-friendly form values (empty strings allowed) into the
 * backend payload (empty strings → undefined, email lower-cased).
 */
export function normaliseCustomerForm(
  values: CustomerFormValues,
): CustomerFormPayload {
  const blank = (v: string | undefined) => {
    const t = (v ?? '').trim();
    return t.length === 0 ? undefined : t;
  };
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    email: blank(values.email)?.toLowerCase(),
    phone: blank(values.phone),
    occupation: blank(values.occupation),
    pipeline_stage: values.pipeline_stage,
    status: values.status,
    id_type:
      values.id_type && (idTypeValues as readonly string[]).includes(values.id_type)
        ? (values.id_type as (typeof idTypeValues)[number])
        : undefined,
    id_number: blank(values.id_number),
    seeking_contract_type:
      values.seeking_contract_type
      && (seekingContractTypeValues as readonly string[]).includes(values.seeking_contract_type)
        ? (values.seeking_contract_type as (typeof seekingContractTypeValues)[number])
        : null,
    budget_min: montant(values.budget_min),
    budget_max: montant(values.budget_max),
    seeking_property_types:
      values.seeking_property_types && values.seeking_property_types.length > 0
        ? values.seeking_property_types
        : null,
    seeking_cities: liste(values.seeking_cities),
    seeking_neighborhoods: liste(values.seeking_neighborhoods),
    min_bedrooms: blank(values.min_bedrooms) === undefined ? null : Number(values.min_bedrooms),
  };
}

/**
 * Timeline note (CustomerNote) — TCK-042 AC: notes horodatées et non
 * modifiables après création. The form only captures the body.
 */
export const customerNoteSchema = z.object({
  body: requiredStringSchema(msgValidation('customer.noteRequired')).max(
    5_000,
    msgValidation('customer.noteTooLong'),
  ),
});

export type CustomerNoteValues = z.infer<typeof customerNoteSchema>;
