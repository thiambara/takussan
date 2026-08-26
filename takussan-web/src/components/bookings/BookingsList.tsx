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

/**
 * TCK-292 — table hors composant : elle transporte la CLÉ (relative au namespace `bookings`),
 * le rendu la résout. Mêmes clés que `BookingDetail.tsx` : un seul vocabulaire de statut.
 */
const STATUS_LABEL_KEY: Record<BookingStatus, string> = {
  pending: 'status.pending',
  confirmed: 'status.confirmed',
  rejected: 'status.rejected',
  cancelled: 'status.cancelled',
  expired: 'status.expired',
  completed: 'status.completed',
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

const TABS: ReadonlyArray<{ value: TabKey; labelKey: string }> = [
  { value: 'pending', labelKey: 'list.tabs.pending' },
  { value: 'confirmed', labelKey: 'list.tabs.confirmed' },
  { value: 'rejected', labelKey: 'list.tabs.rejected' },
  { value: 'cancelled', labelKey: 'list.tabs.cancelled' },
  { value: 'expired', labelKey: 'list.tabs.expired' },
];

/**
 * TCK-171 — 5 status tabs for the customer's bookings list.
 * Filtering is server-side via spatie's `filter[status]`.
 */
export function BookingsList() {
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings');
  const [tab, setTab] = useState<TabKey>('pending');

  return (
    <Tabs value={tab} onValueChange={(v) => setTab((v as TabKey) ?? 'pending')}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {t(tab.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          <BookingsListBody status={tab.value} locale={locale} />
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
        <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
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
  const t = useTranslations('bookings');
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
                {booking.property?.title ?? t('fallbackTitle', { id: String(booking.id) })}
              </h3>
              <Badge variant={STATUS_VARIANT[booking.status]}>
                {t(STATUS_LABEL_KEY[booking.status])}
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
              {booking.reference_number && <> · {t('reference')} {booking.reference_number}</>}
            </p>
          </div>
          {typeof booking.total_amount === 'number' && (
            <div className="text-right">
              <p className="text-sm font-semibold text-stone-900">
                {formatCurrency(booking.total_amount, locale)}
              </p>
              {booking.deposit_paid && (
                <p className="text-xs text-emerald-600">{t('list.depositPaid')}</p>
              )}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
