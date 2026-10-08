'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormGlobalError, FormInput, FormTextarea } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useRefundBookingPayment } from '@/lib/queries/bookings';
import { bookingRefundSchema, type BookingRefundFormValues } from '@/lib/schemas/booking';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { Booking, BookingPayment } from '@/types/booking';

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
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(p.amount, locale)}
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
          bookingId={booking.id}
          payment={target}
          locale={locale}
          onClose={() => setTarget(null)}
        />
      )}
    </section>
  );
}

function BookingRefundDialog({
  bookingId,
  payment,
  locale,
  onClose,
}: {
  readonly bookingId: number;
  readonly payment: BookingPayment;
  readonly locale: Locale;
  readonly onClose: () => void;
}) {
  const t = useTranslations('bookings.detail.refund');
  const tCommon = useTranslations('common');
  const refund = useRefundBookingPayment(bookingId);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    BookingRefundFormValues,
    unknown
  >({
    schema: bookingRefundSchema,
    defaultValues: { refund_amount: payment.amount, refund_reason: '' },
    onSubmit: async (values) => {
      await refund.mutateAsync({ paymentId: payment.id, ...values });
      return undefined;
    },
    onSuccess: () => {
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('dialogDescription', { amount: formatCurrency(payment.amount, locale) })}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormGlobalError>{globalError}</FormGlobalError>
          <FormInput<BookingRefundFormValues>
            control={form.control}
            name="refund_amount"
            type="number"
            label={t('fields.amount')}
            required
            min={1}
            step={1}
          />
          <FormTextarea<BookingRefundFormValues>
            control={form.control}
            name="refund_reason"
            label={t('fields.reason')}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
