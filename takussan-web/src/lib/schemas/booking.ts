import { z } from 'zod';
import { PAYMENT_METHOD_VALUES } from '@/components/payments/constants';
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

/**
 * TCK-2594 — les huit moyens de `PaymentMethod` (l'API les accepte tous, `StoreBookingPaymentRequest`) :
 * la feuille « Enregistrer un paiement » propose Orange Money, Wave, Free Money… et plus seulement
 * les quatre d'avant. Un montant vidé se dit comme un montant nul.
 */
export const bookingPaymentSchema = z.object({
  amount: z.number({ error: msgValidation('common.amountPositive') }).positive(msgValidation('common.amountPositive')),
  payment_method: z.enum(PAYMENT_METHOD_VALUES),
  // TCK-2877 (TCK-2892) — la caution d'un séjour et un paiement « autre ».
  payment_type: z.enum(['deposit', 'advance', 'fee', 'security_deposit', 'other']),
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
})
  // TCK-2877 — « Autre » dit ce qu'il est : l'API exige `notes` (`required_if:payment_type,other`).
  .refine((v) => v.payment_type !== 'other' || (v.notes ?? '').trim().length > 0, {
    message: msgValidation('booking.notesRequiredForOther'),
    path: ['notes'],
  });

export type BookingPaymentFormValues = z.infer<typeof bookingPaymentSchema>;

/** TCK-596 — remboursement d'un paiement de réservation (`RefundBookingPaymentRequest`). */
export const bookingRefundSchema = z.object({
  refund_amount: z.number({ error: msgValidation('common.amountPositive') }).positive(msgValidation('common.amountPositive')),
  refund_reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type BookingRefundFormValues = z.infer<typeof bookingRefundSchema>;

/**
 * TCK-2876 — « Contre-proposer » (`FeuilleDeContreOffre`) : le montant, le message facultatif et la
 * validité en jours (l'API admet d'aujourd'hui à J+30 ; J+3 par défaut). TCK-2877 — déplacé ici
 * depuis la feuille, pour que ses clés de message passent par le traducteur des schémas.
 */
export const VALIDITES_DE_CONTRE_OFFRE = ['3', '7', '15', '30'] as const;

export const contreOffreSchema = z.object({
  amount: z.number({ error: msgValidation('common.amountPositive') }).int().positive(msgValidation('common.amountPositive')),
  message: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  validite: z.enum(VALIDITES_DE_CONTRE_OFFRE),
});

export type ContreOffreFormValues = z.infer<typeof contreOffreSchema>;
