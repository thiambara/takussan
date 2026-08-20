import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Invoice & payout form schemas — TCK-063.
 *
 * Mirrors Laravel validation in `InvoiceController::store` and
 * `PayoutController::store`.
 */

const isoDate = z
  .string()
  .trim()
  .min(1, msgValidation('common.dateRequired'))
  .regex(/^\d{4}-\d{2}-\d{2}$/, msgValidation('payment.dateInvalid'));

export const invoiceCurrencySchema = z
  .enum(['XOF', 'XAF', 'EUR', 'USD'])
  .default('XOF');

export const invoiceItemSchema = z.object({
  description: z
    .string({ error: msgValidation('payment.itemDescriptionRequired') })
    .trim()
    .min(1, msgValidation('payment.itemDescriptionRequired'))
    .max(500),
  quantity: z
    .number({ error: msgValidation('payment.quantityRequired') })
    .positive(msgValidation('payment.quantityPositive')),
  unit_price: z
    .number({ error: msgValidation('payment.unitPriceRequired') })
    .nonnegative(msgValidation('payment.unitPriceNonNegative')),
});

export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;

export const createInvoiceSchema = z
  .object({
    customer_id: z
      .number({ error: msgValidation('payment.customerRequired') })
      .int()
      .positive(msgValidation('payment.customerRequired')),
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
      .min(1, msgValidation('payment.itemsMin')),
    tax_rate: z
      .number()
      .min(0, msgValidation('payment.taxMin'))
      .max(100, msgValidation('payment.taxMax'))
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
        message: msgValidation('payment.invoiceableBoth'),
      });
    }
    if (data.due_date && data.issue_date && data.due_date < data.issue_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['due_date'],
        message: msgValidation('payment.dueDateAfterIssue'),
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
      .number({ error: msgValidation('payment.landlordRequired') })
      .int()
      .positive(msgValidation('payment.landlordRequired')),
    lease_id: z.number().int().positive().optional(),
    booking_id: z.number().int().positive().optional(),
    period_start: isoDate.optional().or(z.literal('').transform(() => undefined)),
    period_end: isoDate.optional().or(z.literal('').transform(() => undefined)),
    gross_amount: z
      .number({ error: msgValidation('payment.grossRequired') })
      .positive(msgValidation('payment.grossPositive')),
    commission_rate: z
      .number()
      .min(0, msgValidation('payment.commissionMin'))
      .max(100, msgValidation('payment.commissionMax'))
      .optional(),
    commission_amount: z
      .number()
      .nonnegative(msgValidation('payment.commissionMin'))
      .optional(),
    fees_amount: z
      .number()
      .nonnegative(msgValidation('payment.feesMin'))
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
        message: msgValidation('payment.periodEndAfterStart'),
      });
    }
    const commission = data.commission_amount ?? 0;
    const fees = data.fees_amount ?? 0;
    const net = data.gross_amount - commission - fees;
    if (net <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['gross_amount'],
        message: msgValidation('payment.netPositive'),
      });
    }
  });

export type CreatePayoutFormValues = z.infer<typeof createPayoutSchema>;
