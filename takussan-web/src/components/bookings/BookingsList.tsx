'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useBookings } from '@/lib/queries/bookings';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { Booking, BookingStatus } from '@/types/booking';
import type { Locale } from '@/i18n/config';

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

export function BookingsList() {
  const locale = useLocale() as Locale;
  const { data, isLoading, isError } = useBookings({ per_page: 30 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl bg-app-surface-1"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger vos réservations.
      </p>
    );
  }

  const bookings = data?.data ?? [];

  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Aucune réservation pour l&apos;instant.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {bookings.map((b) => (
        <BookingRow key={b.id} booking={b} locale={locale} />
      ))}
    </ul>
  );
}

function BookingRow({ booking, locale }: { booking: Booking; locale: Locale }) {
  return (
    <li>
      <Link
        href={`/app/bookings/${booking.id}`}
        className="block rounded-xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-stone-900">
                {booking.property?.title ?? `Réservation #${booking.id}`}
              </h3>
              <Badge variant={STATUS_VARIANT[booking.status]}>
                {STATUS_LABEL[booking.status]}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {booking.start_date && booking.end_date ? (
                <>
                  {formatDate(booking.start_date, locale)} → {formatDate(booking.end_date, locale)}
                </>
              ) : (
                formatDate(booking.created_at, locale)
              )}
              {booking.reference_number && <> · Réf. {booking.reference_number}</>}
            </p>
          </div>
          {typeof booking.total_amount === 'number' && (
            <div className="text-right">
              <p className="text-sm font-semibold text-stone-900">
                {formatCurrency(booking.total_amount, locale)}
              </p>
              {booking.deposit_paid && (
                <p className="text-xs text-emerald-600">Acompte payé</p>
              )}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
