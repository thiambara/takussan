'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useBooking, useCancelBooking } from '@/lib/queries/bookings';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { isAgent, isAdmin, isOwner } from '@/lib/roles';
import type { Locale } from '@/i18n/config';
import type { Booking, BookingStatus } from '@/types/booking';
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
  const { user } = useAuth();
  const agencyId = data?.data?.agency_id ?? null;
  const { providers } = usePaymentProviders(agencyId);
  const cancelBooking = useCancelBooking(bookingId);
  const isDashboardAgent = user ? isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles) : false;

  async function handleCancel() {
    const reason = window.prompt('Motif d’annulation (facultatif)') ?? undefined;
    await cancelBooking.mutateAsync({ reason });
  }

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
  const isCustomer =
    !!user?.id && !!booking.customer && user.id === booking.customer.user_id;
  const canCancel =
    (isCustomer || isDashboardAgent) &&
    (booking.status === 'pending' || booking.status === 'confirmed');

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
          {isDashboardAgent && (
            <Button variant="outline" onClick={() => setPaymentOpen(true)}>
              Enregistrer un paiement
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={cancelBooking.isPending}
              className="text-red-600 hover:text-red-700"
            >
              Annuler la réservation
            </Button>
          )}
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
          <dd className="mt-1 text-stone-900">{formatDateTime(booking.created_at ?? booking.booking_date, locale) || '—'}</dd>

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

      {!isDashboardAgent && canBookingLeaveReview(booking) && booking.property?.slug && (
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

      <BookingTimeline booking={booking} locale={locale} />

      <BookingPaymentDialog
        bookingId={bookingId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
    </div>
  );
}

type TimelineEvent = { label: string; at: string };

function BookingTimeline({ booking, locale }: { booking: Booking; locale: Locale }) {
  const events: TimelineEvent[] = [];
  if (booking.created_at) events.push({ label: 'Créée', at: booking.created_at });
  const confirmedAt = booking.confirmed_at ?? booking.confirmation_date;
  if (confirmedAt) events.push({ label: 'Confirmée', at: confirmedAt });
  if (booking.deposit_paid && booking.deposit_date) {
    events.push({ label: 'Acompte payé', at: booking.deposit_date });
  }
  if (booking.completion_date) events.push({ label: 'Soldée', at: booking.completion_date });
  const cancelledAt = booking.cancelled_at ?? booking.cancellation_date;
  if (cancelledAt) events.push({ label: 'Annulée', at: cancelledAt });
  if (booking.rejection_date) events.push({ label: 'Refusée', at: booking.rejection_date });
  const expiredAt = booking.expired_at ?? booking.expires_at ?? booking.expiration_date;
  if (expiredAt && booking.status === 'expired') {
    events.push({ label: 'Expirée', at: expiredAt });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">Historique</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {events.map((e) => (
          <li key={`${e.label}-${e.at}`} className="flex items-baseline gap-3">
            <span className="size-1.5 shrink-0 rounded-full bg-stone-400" aria-hidden="true" />
            <span className="text-stone-900 font-medium">{e.label}</span>
            <span className="text-xs text-stone-500">
              {formatDateTime(e.at, locale)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
