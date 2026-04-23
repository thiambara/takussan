import { z } from 'zod';

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
  .min(1, 'La date est requise.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide.');

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
      .number({ error: 'Le nombre de personnes est requis.' })
      .int('Le nombre de personnes doit être un entier.')
      .min(1, 'Au moins 1 personne.')
      .max(20, 'Maximum 20 personnes.'),
    notes: z
      .string()
      .trim()
      .max(1000, 'Le message est trop long (1000 caractères max).')
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
          message: 'La date de fin doit être postérieure à la date de début.',
        });
      }
    }
    if (!data.accept_terms) {
      ctx.addIssue({
        code: 'custom',
        path: ['accept_terms'],
        message: 'Vous devez accepter les conditions.',
      });
    }
  });

export type BookingRequestFormValues = z.infer<typeof bookingRequestSchema>;

export const bookingPaymentSchema = z.object({
  amount: z.number().positive('Le montant doit être supérieur à 0.'),
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
