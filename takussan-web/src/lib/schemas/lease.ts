import { z } from 'zod';
import { optionalPhoneSchema } from './common';
import { msgValidation } from './messages';

/**
 * Lease-related schemas (TCK-044).
 *
 * Aligned with the Laravel Lease, LeasePayment and Guarantor models
 * (`docs/models-spec.md#14-lease-`, `#15-leasepayment-`, `#27-guarantor-`).
 */

const isoDate = z
  .string()
  .trim()
  .min(1, msgValidation('common.dateRequired'))
  .regex(/^\d{4}-\d{2}-\d{2}$/, msgValidation('common.dateInvalid'));

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
      .number({ error: msgValidation('lease.propertyRequired') })
      .int()
      .positive(msgValidation('lease.propertyRequired')),
    tenant_id: z
      .number({ error: msgValidation('lease.tenantRequired') })
      .int()
      .positive(msgValidation('lease.tenantRequired')),
    landlord_id: z
      .number({ error: msgValidation('lease.landlordRequired') })
      .int()
      .positive(msgValidation('lease.landlordRequired')),
    agency_id: z.number().int().positive().optional(),
    type: leaseTypeSchema,
    start_date: isoDate,
    end_date: isoDate.optional().or(z.literal('').transform(() => undefined)),
    monthly_rent: z
      .number({ error: msgValidation('lease.rentRequired') })
      .positive(msgValidation('lease.rentPositive'))
      .optional(),
    sale_price: z.number().positive().optional(),
    deposit_amount: z
      .number({ error: msgValidation('lease.depositRequired') })
      .nonnegative(msgValidation('lease.depositNonNegative')),
    currency: z.enum(['XOF', 'XAF', 'EUR', 'USD']).default('XOF'),
    payment_frequency: paymentFrequencySchema.default('monthly'),
    payment_day: z
      .number()
      .int()
      .min(1, msgValidation('lease.paymentDayInvalid'))
      .max(28, msgValidation('lease.paymentDayInvalid'))
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
          message: msgValidation('lease.salePriceRequired'),
        });
      }
    } else {
      if (!data.monthly_rent || data.monthly_rent <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['monthly_rent'],
          message: msgValidation('lease.monthlyRentRequired'),
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
          message: msgValidation('common.endDateAfterStart'),
        });
      }
    }
  });

export type CreateLeaseFormValues = z.infer<typeof createLeaseSchema>;

export const leasePaymentSchema = z.object({
  amount: z.number().positive(msgValidation('common.amountPositive')),
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
  first_name: z.string().trim().min(1, msgValidation('common.firstNameRequired')).max(100),
  last_name: z.string().trim().min(1, msgValidation('common.lastNameRequired')).max(100),
  phone: optionalPhoneSchema,
  email: z
    .string()
    .trim()
    .email(msgValidation('lease.emailInvalid'))
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

// TCK-088 — refund deposit modal. The "reason required iff partial" rule
// is enforced via .superRefine() against `depositRemaining` passed at
// construction time, so the schema instance is built per-render.
export function buildDepositRefundSchema(depositRemaining: number) {
  return z
    .object({
      amount: z.number().positive(msgValidation('common.amountPositive')),
      reason: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .or(z.literal('').transform(() => undefined)),
      attachments: z.array(z.number().int()).optional(),
    })
    .superRefine((values, ctx) => {
      if (values.amount > depositRemaining + 0.001) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: msgValidation('lease.refundExceedsDeposit'),
        });
      }
      const isPartial = values.amount + 0.001 < depositRemaining;
      if (isPartial && (!values.reason || values.reason.length === 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['reason'],
          message: msgValidation('lease.refundReasonRequired'),
        });
      }
    });
}

export type DepositRefundFormValues = z.infer<ReturnType<typeof buildDepositRefundSchema>>;
