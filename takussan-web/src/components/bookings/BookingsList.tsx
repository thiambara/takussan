'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck } from 'lucide-react';
import { useBookings } from '@/lib/queries/bookings';
import { formatCurrency, formatDate } from '@/lib/format';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

type TabKey = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';

const TABS: ReadonlyArray<{ value: TabKey; label: string }> = [
  { value: 'pending', label: 'En attente' },
  { value: 'confirmed', label: 'Confirmées' },
  { value: 'rejected', label: 'Refusées' },
  { value: 'cancelled', label: 'Annulées' },
  { value: 'expired', label: 'Expirées' },
];

/**
 * TCK-171 — 5 status tabs for the customer's bookings list.
 * Filtering is server-side via spatie's `filter[status]`.
 */
export function BookingsList() {
  const locale = useLocale() as Locale;
  const [tab, setTab] = useState<TabKey>('pending');

  return (
    <Tabs value={tab} onValueChange={(v) => setTab((v as TabKey) ?? 'pending')}>
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-4">
          <BookingsListBody status={t.value} locale={locale} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function BookingsListBody({
  status,
  locale,
}: {
  // `TabKey` et non `BookingStatus` : le libellé d'état vide est indexé par onglet
  // (`empty.<TabKey>`), et `completed` n'a pas d'onglet.
  status: TabKey;
  locale: Locale;
}) {
  const t = useTranslations('bookings.list');
  const query = useBookings({ status, per_page: 30 });

  return (
    <QueryBoundary
      query={query}
      loadingFallback={[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-app-surface-1" />
      ))}
    >
      {(data) => {
        const bookings = data.data ?? [];
        if (bookings.length === 0) {
          return (
            <EmptyState
              icon={<CalendarCheck className="size-8" aria-hidden="true" />}
              title={t(`empty.${status}`)}
              description={t('empty_description')}
            />
          );
        }

        return (
          <ul className="space-y-3">
            {bookings.map((b) => (
              <BookingRow key={b.id} booking={b} locale={locale} />
            ))}
          </ul>
        );
      }}
    </QueryBoundary>
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
