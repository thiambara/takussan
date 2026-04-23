import { z } from 'zod';

/**
 * Invoice & payout form schemas — TCK-063.
 *
 * Mirrors Laravel validation in `InvoiceController::store` and
 * `PayoutController::store`.
 */

const isoDate = z
  .string()
  .trim()
  .min(1, 'La date est requise.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).');

export const invoiceCurrencySchema = z
  .enum(['XOF', 'XAF', 'EUR', 'USD'])
  .default('XOF');

export const invoiceItemSchema = z.object({
  description: z
    .string({ error: 'La description est requise.' })
    .trim()
    .min(1, 'La description est requise.')
    .max(500),
  quantity: z
    .number({ error: 'Quantité requise.' })
    .positive('La quantité doit être supérieure à 0.'),
  unit_price: z
    .number({ error: 'Prix unitaire requis.' })
    .nonnegative('Le prix doit être ≥ 0.'),
});

export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;

export const createInvoiceSchema = z
  .object({
    customer_id: z
      .number({ error: 'Client requis.' })
      .int()
      .positive('Client requis.'),
    invoiceable_type: z.enum(['lease', 'booking']).optional(),
    invoiceable_id: z
      .number()
      .int()
      .positive()
      .optional(),
    issue_date: isoDate,
    due_date: isoDate.optional().or(z.literal('').transform(() => undefined)),
    items: z
      .array(invoiceItemSchema)
      .min(1, 'Au moins une ligne est requise.'),
    tax_rate: z
      .number()
      .min(0, 'La TVA doit être ≥ 0.')
      .max(100, 'La TVA doit être ≤ 100.')
      .optional(),
    currency: invoiceCurrencySchema,
    notes: z.string().trim().max(5000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const hasType = !!data.invoiceable_type;
    const hasId = !!data.invoiceable_id;
    if (hasType !== hasId) {
      ctx.addIssue({
        code: 'custom',
        path: ['invoiceable_id'],
        message: 'Fournir à la fois le type et l\'identifiant de l\'entité, ou aucun.',
      });
    }
    if (data.due_date && data.issue_date && data.due_date < data.issue_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['due_date'],
        message: "L'échéance doit être postérieure ou égale à la date d'émission.",
      });
    }
  });

export type CreateInvoiceFormValues = z.infer<typeof createInvoiceSchema>;

export const payoutPaymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'mobile_money',
  'wave',
  'orange_money',
  'free_money',
  'check',
  'card',
]);

export const createPayoutSchema = z
  .object({
    landlord_id: z
      .number({ error: 'Bailleur requis.' })
      .int()
      .positive('Bailleur requis.'),
    lease_id: z.number().int().positive().optional(),
    booking_id: z.number().int().positive().optional(),
    period_start: isoDate.optional().or(z.literal('').transform(() => undefined)),
    period_end: isoDate.optional().or(z.literal('').transform(() => undefined)),
    gross_amount: z
      .number({ error: 'Montant brut requis.' })
      .positive('Le montant brut doit être supérieur à 0.'),
    commission_rate: z
      .number()
      .min(0, 'La commission doit être ≥ 0.')
      .max(100, 'La commission doit être ≤ 100.')
      .optional(),
    commission_amount: z
      .number()
      .nonnegative('La commission doit être ≥ 0.')
      .optional(),
    fees_amount: z
      .number()
      .nonnegative('Les frais doivent être ≥ 0.')
      .optional(),
    currency: invoiceCurrencySchema,
    payment_method: payoutPaymentMethodSchema.optional(),
    scheduled_at: isoDate.optional().or(z.literal('').transform(() => undefined)),
    notes: z.string().trim().max(5000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.period_start && data.period_end && data.period_end < data.period_start) {
      ctx.addIssue({
        code: 'custom',
        path: ['period_end'],
        message: 'La fin de période doit être postérieure au début.',
      });
    }
    const commission = data.commission_amount ?? 0;
    const fees = data.fees_amount ?? 0;
    const net = data.gross_amount - commission - fees;
    if (net <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['gross_amount'],
        message: 'Le montant net doit être supérieur à 0.',
      });
    }
  });

export type CreatePayoutFormValues = z.infer<typeof createPayoutSchema>;
