'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useBooking } from '@/lib/queries/bookings';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import type { BookingStatus } from '@/types/booking';
import { BookingPaymentDialog } from './BookingPaymentDialog';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canBookingLeaveReview } from '@/components/reviews/reviewEligibility';

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  expired: 'Expirée',
  completed: 'Terminée',
};

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  confirmed: 'default',
  rejected: 'destructive',
  cancelled: 'secondary',
  expired: 'secondary',
  completed: 'default',
};

interface BookingDetailProps {
  readonly bookingId: number;
}

export function BookingDetail({ bookingId }: BookingDetailProps) {
  const locale = useLocale() as Locale;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { data, isLoading, isError } = useBooking(bookingId);
  const agencyId = data?.data?.agency_id ?? null;
  const { providers } = usePaymentProviders(agencyId);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-app-surface-1" />;
  }

  if (isError || !data) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Réservation introuvable.
      </p>
    );
  }

  const booking = data.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/bookings"
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            ← Retour aux réservations
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-app-ink">
            {booking.property?.title ?? `Réservation #${booking.id}`}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
            <Badge variant={STATUS_VARIANT[booking.status]}>
              {STATUS_LABEL[booking.status]}
            </Badge>
            {booking.reference_number && <span>Réf. {booking.reference_number}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            Enregistrer un paiement
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">Dates</dt>
          <dd className="mt-1 text-stone-900">
            {booking.start_date && booking.end_date ? (
              <>
                {formatDate(booking.start_date, locale)} → {formatDate(booking.end_date, locale)}
              </>
            ) : (
              '—'
            )}
          </dd>

          <dt className="mt-4 text-xs uppercase tracking-wide text-stone-500">Créée le</dt>
          <dd className="mt-1 text-stone-900">{formatDateTime(booking.booking_date, locale)}</dd>

          {booking.expiration_date && (
            <>
              <dt className="mt-4 text-xs uppercase tracking-wide text-stone-500">
                Expire le
              </dt>
              <dd className="mt-1 text-stone-900">
                {formatDateTime(booking.expiration_date, locale)}
              </dd>
            </>
          )}
        </dl>

        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">Total</dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">
            {typeof booking.total_amount === 'number'
              ? formatCurrency(booking.total_amount, locale)
              : '—'}
          </dd>

          <dt className="mt-4 text-xs uppercase tracking-wide text-stone-500">Acompte</dt>
          <dd className="mt-1 text-stone-900">
            {typeof booking.deposit_amount === 'number'
              ? formatCurrency(booking.deposit_amount, locale)
              : '—'}
            {booking.deposit_paid && (
              <Badge variant="default" className="ml-2">
                Payé
              </Badge>
            )}
          </dd>
        </dl>
      </div>

      {booking.notes && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Message</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{booking.notes}</p>
        </div>
      )}

      {canBookingLeaveReview(booking) && booking.property?.slug && (
        <LeaveReviewCta
          slug={booking.property.slug}
          context="Votre séjour est terminé."
          propertyTitle={booking.property.title}
        />
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Paiements</h2>
        {booking.booking_payments && booking.booking_payments.length > 0 ? (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {booking.booking_payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-stone-600">
                  {formatDateTime(p.payment_date ?? p.created_at, locale)} ·{' '}
                  <span className="capitalize">{p.payment_type}</span>
                </span>
                <span className="flex items-center gap-2 text-stone-900">
                  <span className="font-medium">
                    {formatCurrency(p.amount, locale)}
                  </span>
                  <span className="text-xs text-stone-500">{p.status}</span>
                  {p.status === 'pending' && (
                    <PayOnlineButton
                      paymentType="booking-payments"
                      paymentId={p.id}
                      currency={p.currency}
                      availableProviders={providers}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">
            Aucun paiement enregistré pour l&apos;instant.
          </p>
        )}
      </section>

      <BookingPaymentDialog
        bookingId={bookingId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
    </div>
  );
}
