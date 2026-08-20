import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Booking-related schemas (TCK-043).
 *
 * Aligned with the Laravel Booking and BookingPayment models
 * (see `docs/models-spec.md#5-booking` and `#6-bookingpayment`).
 * The client schema is a strict subset of the backend FormRequest.
 */

const isoDate = z
  .string()
  .trim()
  .min(1, msgValidation('common.dateRequired'))
  .regex(/^\d{4}-\d{2}-\d{2}$/, msgValidation('common.dateInvalid'));

/**
 * Single-step source data — the full tunnel is validated section by section
 * but the whole form is submitted at once at the end.
 */
export const bookingRequestSchema = z
  .object({
    property_id: z.number().int().positive(),
    start_date: isoDate,
    end_date: isoDate,
    guests: z
      .number({ error: msgValidation('booking.guestsRequired') })
      .int(msgValidation('booking.guestsInteger'))
      .min(1, msgValidation('booking.guestsMin'))
      .max(20, msgValidation('booking.guestsMax')),
    notes: z
      .string()
      .trim()
      .max(1000, msgValidation('booking.notesTooLong'))
      .optional()
      .or(z.literal('').transform(() => undefined)),
    accept_terms: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.start_date && data.end_date) {
      const s = new Date(data.start_date);
      const e = new Date(data.end_date);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return;
      if (e.getTime() <= s.getTime()) {
        ctx.addIssue({
          code: 'custom',
          path: ['end_date'],
          message: msgValidation('common.endDateAfterStart'),
        });
      }
    }
    if (!data.accept_terms) {
      ctx.addIssue({
        code: 'custom',
        path: ['accept_terms'],
        message: msgValidation('booking.acceptTerms'),
      });
    }
  });

export type BookingRequestFormValues = z.infer<typeof bookingRequestSchema>;

export const bookingPaymentSchema = z.object({
  amount: z.number().positive(msgValidation('common.amountPositive')),
  payment_method: z.enum(['cash', 'bank_transfer', 'mobile_money', 'card']),
  payment_type: z.enum(['deposit', 'advance', 'fee']),
  transaction_id: z
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

export type BookingPaymentFormValues = z.infer<typeof bookingPaymentSchema>;
