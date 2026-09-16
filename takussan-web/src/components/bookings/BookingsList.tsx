'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { useBookings } from '@/lib/queries/bookings';
import { formatCurrency, formatDate } from '@/lib/format';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { StatusBadge } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Booking } from '@/types/booking';
import type { Locale } from '@/i18n/config';
import { BOOKING_STATUS_LABEL_KEY, BOOKING_STATUS_TONE } from './booking-status';

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
      {/* Cinq onglets ne tiennent pas à 390 : la rangée défile au lieu de couper « Expirées ». */}
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

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
      loadingFallback={
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      }
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
        className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-150 hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
                {booking.property?.title ?? t('fallbackTitle', { id: String(booking.id) })}
              </h3>
              <StatusBadge
                tone={BOOKING_STATUS_TONE[booking.status]}
                label={t(BOOKING_STATUS_LABEL_KEY[booking.status])}
              />
            </div>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
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
            <div className="flex items-baseline gap-2 sm:block sm:shrink-0 sm:text-right">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(booking.total_amount, locale)}
              </p>
              {booking.deposit_paid && (
                <p className="text-xs text-success">{t('list.depositPaid')}</p>
              )}
            </div>
          )}
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
