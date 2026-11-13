'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormAmountInput, FormGlobalError, FormTextarea } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useRefundBookingPayment } from '@/lib/queries/bookings';
import { bookingRefundSchema, type BookingRefundFormValues } from '@/lib/schemas/booking';
import { formatCurrency, formatDate } from '@/lib/format';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { Locale } from '@/i18n/config';
import type { Booking, BookingPayment } from '@/types/booking';
import { useNomDuClient } from './liste/pieces';
import { Avertissement, FeuilleOuPanneau, useEnPanneau } from './feuilles/pieces-des-feuilles';

interface BookingRefundPanelProps {
  readonly booking: Booking;
  readonly locale: Locale;
  /** Le client lit l'état de SON remboursement ; les autres lisent ce qu'il reste à traiter. */
  readonly isCustomer: boolean;
}

/**
 * TCK-596 — l'acompte d'une réservation fermée sans avoir eu lieu.
 *
 * Le client voit où en est son remboursement (« en cours », « remboursé ») ; qui peut rembourser
 * (`can_refund`, jugé par l'API) voit « remboursement à traiter » et le geste, paiement par
 * paiement. Bloc distinct du reçu de TCK-593 : le détail ne le monte que si l'API annonce un état.
 */
export function BookingRefundPanel({ booking, locale, isCustomer }: BookingRefundPanelProps) {
  const t = useTranslations('bookings.detail.refund');
  const [target, setTarget] = useState<BookingPayment | null>(null);

  if (booking.refund_status == null) return null;

  const refunded = booking.refund_status === 'refunded';
  const toProcess = !refunded && !isCustomer;
  // Le geste ne s'affiche qu'à qui peut le faire aboutir : l'API en juge (`can_refund`).
  const canAct = toProcess && booking.can_refund === true;
  const paid = (booking.booking_payments ?? []).filter((p) => p.status === 'paid');

  const title = refunded ? t('refundedTitle') : toProcess ? t('toProcessTitle') : t('pendingTitle');
  const description = refunded
    ? t('refundedDescription')
    : toProcess
      ? t('toProcessDescription')
      : t('pendingDescription');

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      data-testid="booking-refund-panel"
    >
      <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
      {canAct && paid.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {paid.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex flex-col">
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(p.amount, locale)}
                </span>
                {p.paid_out != null && (
                  <span className="text-xs text-muted-foreground">
                    {t('paidOut', {
                      date: formatDate(p.paid_out.processed_at, locale),
                      reference: p.paid_out.reference_number,
                    })}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-8"
                onClick={() => setTarget(p)}
              >
                {t('action')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canAct && target !== null && (
        <BookingRefundDialog
          key={target.id}
          booking={booking}
          payment={target}
          locale={locale}
          onClose={() => setTarget(null)}
        />
      )}
    </section>
  );
}

/**
 * TCK-2594 — « Rembourser Awa Diop » (maquette `app-reservations` a, écran « Rembourser ») : la
 * feuille du bas au téléphone, le panneau droit dès `xl`. Le montant est prérempli de ce que le
 * client a payé et l'aide en dit le plafond ; l'avertissement des fonds déjà reversés reste
 * (TCK-2153) ; le bouton, destructif, dit le montant qu'il rend.
 */
function BookingRefundDialog({
  booking,
  payment,
  locale,
  onClose,
}: {
  readonly booking: Booking;
  readonly payment: BookingPayment;
  readonly locale: Locale;
  readonly onClose: () => void;
}) {
  const t = useTranslations('bookings.detail.refund');
  const tFeuille = useTranslations('bookings.feuilles.rembourser');
  const f = useFormatteurs();
  const panneau = useEnPanneau();
  const formId = useId();
  const nomDuClient = useNomDuClient();
  const refund = useRefundBookingPayment(booking.id);
  const devise = payment.currency ?? booking.currency ?? 'XOF';
  const nom = nomDuClient(booking);
  const prenom = booking.customer?.first_name?.trim() || nom;

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    BookingRefundFormValues,
    unknown
  >({
    schema: bookingRefundSchema,
    defaultValues: { refund_amount: Number(payment.amount), refund_reason: '' },
    onSubmit: async (values) => {
      await refund.mutateAsync({ paymentId: payment.id, ...values });
      return undefined;
    },
    onSuccess: () => {
      onClose();
    },
  });

  const montant = useWatch({ control: form.control, name: 'refund_amount' });

  const pied = (
    <Button
      type="submit"
      form={formId}
      variant="destructive"
      size={panneau ? 'default' : 'xl'}
      className={panneau ? undefined : 'w-full'}
      disabled={isSubmitting}
    >
      {isSubmitting
        ? t('submitting')
        : typeof montant === 'number' && montant > 0
          ? tFeuille('rembourserMontant', { montant: f.montantCourt(montant, devise) })
          : t('action')}
    </Button>
  );

  return (
    <FeuilleOuPanneau open onOpenChange={(open) => !open && onClose()} titre={tFeuille('titre', { nom })} pied={pied}>
      <form
        id={formId}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-4 pt-1"
      >
        <FormGlobalError>{globalError}</FormGlobalError>
        <div>
          <FormAmountInput<BookingRefundFormValues>
            control={form.control}
            name="refund_amount"
            label={tFeuille('montant')}
            currency={devise}
            unite="F"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {tFeuille('montantAide', { montant: f.montantCourt(payment.amount, devise), prenom })}
          </p>
        </div>
        <FormTextarea<BookingRefundFormValues>
          control={form.control}
          name="refund_reason"
          label={t('fields.reason')}
          rows={3}
        />
        {/* TCK-2153 (P205.02) — avertir sans refuser : la reprise suit (ADR-0039, 2026-10-24). */}
        {payment.paid_out != null && (
          <Avertissement>
            {t('paidOutWarning', {
              date: formatDate(payment.paid_out.processed_at, locale),
              reference: payment.paid_out.reference_number,
            })}
          </Avertissement>
        )}
      </form>
    </FeuilleOuPanneau>
  );
}
