import { z } from 'zod';
import { optionalPhoneSchema } from './common';

/**
 * Lease-related schemas (TCK-044).
 *
 * Aligned with the Laravel Lease, LeasePayment and Guarantor models
 * (`docs/models-spec.md#14-lease-`, `#15-leasepayment-`, `#27-guarantor-`).
 */

const isoDate = z
  .string()
  .trim()
  .min(1, 'La date est requise.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide.');

export const leaseTypeSchema = z.enum([
  'residential_rent',
  'commercial_rent',
  'seasonal_rent',
  'sale',
]);

export const paymentFrequencySchema = z.enum(['monthly', 'quarterly', 'yearly']);

export const createLeaseSchema = z
  .object({
    property_id: z
      .number({ error: 'Bien requis.' })
      .int()
      .positive('Bien requis.'),
    tenant_id: z
      .number({ error: 'Locataire requis.' })
      .int()
      .positive('Locataire requis.'),
    landlord_id: z
      .number({ error: 'Bailleur requis.' })
      .int()
      .positive('Bailleur requis.'),
    agency_id: z.number().int().positive().optional(),
    type: leaseTypeSchema,
    start_date: isoDate,
    end_date: isoDate.optional().or(z.literal('').transform(() => undefined)),
    monthly_rent: z
      .number({ error: 'Loyer mensuel requis.' })
      .positive('Le loyer doit être supérieur à 0.')
      .optional(),
    sale_price: z.number().positive().optional(),
    deposit_amount: z
      .number({ error: 'Caution requise.' })
      .nonnegative('La caution doit être ≥ 0.'),
    currency: z.enum(['XOF', 'XAF', 'EUR', 'USD']).default('XOF'),
    payment_frequency: paymentFrequencySchema.default('monthly'),
    payment_day: z
      .number()
      .int()
      .min(1, 'Jour invalide (1–28).')
      .max(28, 'Jour invalide (1–28).')
      .optional(),
    terms: z.string().trim().max(5000).optional(),
    special_conditions: z.string().trim().max(5000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'sale') {
      if (!data.sale_price || data.sale_price <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['sale_price'],
          message: 'Le prix de vente est requis pour un contrat de vente.',
        });
      }
    } else {
      if (!data.monthly_rent || data.monthly_rent <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['monthly_rent'],
          message: 'Le loyer mensuel est requis pour une location.',
        });
      }
    }
    if (data.start_date && data.end_date) {
      const s = new Date(data.start_date);
      const e = new Date(data.end_date);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e <= s) {
        ctx.addIssue({
          code: 'custom',
          path: ['end_date'],
          message: 'La date de fin doit être postérieure à la date de début.',
        });
      }
    }
  });

export type CreateLeaseFormValues = z.infer<typeof createLeaseSchema>;

export const leasePaymentSchema = z.object({
  amount: z.number().positive('Le montant doit être supérieur à 0.'),
  payment_method: z.enum(['cash', 'bank_transfer', 'mobile_money', 'check', 'card']),
  payment_type: z.enum(['rent', 'charges', 'deposit', 'deposit_refund', 'regularization', 'penalty']).default('rent'),
  period_start: isoDate,
  period_end: isoDate,
  paid_at: isoDate.optional().or(z.literal('').transform(() => undefined)),
  reference_number: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type LeasePaymentFormValues = z.infer<typeof leasePaymentSchema>;

export const guarantorSchema = z.object({
  first_name: z.string().trim().min(1, 'Le prénom est requis.').max(100),
  last_name: z.string().trim().min(1, 'Le nom est requis.').max(100),
  phone: optionalPhoneSchema,
  email: z
    .string()
    .trim()
    .email('Email invalide.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  id_type: z.enum(['id_card', 'passport', 'driving_license']).optional(),
  id_number: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  occupation: z
    .string()
    .trim()
    .max(150)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  employer: z
    .string()
    .trim()
    .max(150)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  monthly_income: z.number().nonnegative().optional(),
  relationship_to_tenant: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type GuarantorFormValues = z.infer<typeof guarantorSchema>;

export const generateScheduleSchema = z.object({
  start_date: isoDate.optional().or(z.literal('').transform(() => undefined)),
  end_date: isoDate.optional().or(z.literal('').transform(() => undefined)),
});

export type GenerateScheduleFormValues = z.infer<typeof generateScheduleSchema>;
