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
import { Avertissement, FeuilleOuPanneau, PastillesDeChoix, useEnPanneau } from './feuilles/pieces-des-feuilles';

/**
 * TCK-2877 — ce qu'un paiement peut encore rendre : son montant moins le cumul déjà remboursé
 * (TCK-1214 : un remboursement partiel laisse la ligne `paid`). Le plafond que l'API juge
 * (`booking_payment.refund_exceeds_paid`).
 */
export function plafondDuRemboursement(p: BookingPayment): number {
  return Math.max(0, Number(p.amount ?? 0) - Number(p.refund_amount ?? 0));
}

/** TCK-2877 — les paiements qu'on peut encore rembourser : encaissés, et pas entièrement rendus. */
export function paiementsRemboursables(booking: Booking): BookingPayment[] {
  return (booking.booking_payments ?? []).filter((p) => p.status === 'paid' && plafondDuRemboursement(p) > 0);
}

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
          paiements={[target]}
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
 *
 * TCK-2877 — ouverte aussi depuis un séjour CONFIRMÉ (« Rembourser » des autres gestes et de
 * l'en-tête). Le plafond est ce qui reste à rendre (payé − déjà remboursé) ; plusieurs paiements
 * remboursables se choisissent en pastilles, le premier proposé.
 */
export function BookingRefundDialog({
  booking,
  paiements,
  locale,
  onClose,
}: {
  readonly booking: Booking;
  /** Au moins un paiement ; plusieurs se choisissent dans la feuille. */
  readonly paiements: readonly BookingPayment[];
  readonly locale: Locale;
  readonly onClose: () => void;
}) {
  const tTypes = useTranslations('bookings.paymentType');
  const [cibleId, setCibleId] = useState<number>(paiements[0].id);
  const payment = paiements.find((p) => p.id === cibleId) ?? paiements[0];
  const plafond = plafondDuRemboursement(payment);
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
    defaultValues: { refund_amount: plafond, refund_reason: '' },
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
        {paiements.length > 1 ? (
          <PastillesDeChoix
            libelle={tFeuille('paiement')}
            options={paiements.map((p) => ({
              valeur: String(p.id),
              libelle: `${tTypes.has(p.payment_type) ? tTypes(p.payment_type) : p.payment_type} · ${f.montantCourt(plafondDuRemboursement(p), p.currency ?? devise)}`,
            }))}
            valeur={String(payment.id)}
            onChange={(v) => {
              const suivant = paiements.find((p) => String(p.id) === v);
              if (!suivant) return;
              setCibleId(suivant.id);
              form.setValue('refund_amount', plafondDuRemboursement(suivant), { shouldValidate: false });
            }}
          />
        ) : null}
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
            {tFeuille('montantAide', { montant: f.montantCourt(plafond, devise), prenom })}
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
