'use client';

import Image from 'next/image';
import { Building2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { PropertyDetail } from '@/types/property';

interface BookingSummaryProps {
  readonly property: Pick<
    PropertyDetail,
    | 'title'
    | 'price'
    | 'currency'
    | 'contract_type'
    | 'rent_period_label'
    | 'main_photo_url'
    | 'location'
  >;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly nights?: number;
  readonly totalAmount?: number;
  readonly depositAmount?: number;
}

/**
 * Sticky recap card used across the booking tunnel.
 * Collapses cleanly on mobile (no sticky) and becomes a sidebar on desktop.
 */
export function BookingSummary({
  property,
  startDate,
  endDate,
  nights,
  totalAmount,
  depositAmount,
}: BookingSummaryProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings.summary');
  // `property.rentPeriodsShort.monthly` existe déjà et vaut « mois » : on la réemploie
  // plutôt que d'en créer une jumelle (TCK-292).
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const isRent = property.contract_type === 'rent';
  const periodLabel = property.rent_period_label ?? (isRent ? tPeriods('monthly') : null);
  // TCK-530 — la devise du bien : sans elle, un loyer en EUR s'affichait en F CFA.
  const money = (value: number) => formatCurrency(value, locale, { currency: property.currency ?? 'XOF' });

  return (
    // `lg:top-40` (160 px) : `/bookings` porte la barre fixe du site public (136 px dès `lg`),
    // sous laquelle `top-24` faisait passer le récapitulatif. Même valeur que la fiche du bien.
    <aside className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:sticky lg:top-40">
      <div className="flex items-start gap-3">
        <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
          {property.main_photo_url ? (
            <Image
              src={property.main_photo_url}
              alt=""
              fill
              sizes="64px"
              className="object-cover outline -outline-offset-1 outline-foreground/10"
            />
          ) : (
            <Building2 className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-pretty font-display text-sm font-semibold tracking-tight text-foreground">
            {property.title}
          </h3>
          {property.location?.city && (
            <p className="mt-0.5 text-xs text-muted-foreground">{property.location.city}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4 text-sm tabular-nums">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t('price')}</span>
          <span className="text-right font-medium text-foreground">
            <span className="whitespace-nowrap">{money(property.price)}</span>
            {periodLabel && (
              <span className="ml-1 whitespace-nowrap text-xs text-muted-foreground">/ {periodLabel}</span>
            )}
          </span>
        </div>

        {startDate && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{t('checkIn')}</span>
            <span className="text-foreground">{formatDate(startDate, locale)}</span>
          </div>
        )}
        {endDate && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{t('checkOut')}</span>
            <span className="text-foreground">{formatDate(endDate, locale)}</span>
          </div>
        )}

        {typeof nights === 'number' && nights > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>{t('duration')}</span>
            <span>{t('nights', { count: nights })}</span>
          </div>
        )}

        {typeof totalAmount === 'number' && totalAmount > 0 && (
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-base font-semibold text-foreground">
            <span>{t('total')}</span>
            <span>{money(totalAmount)}</span>
          </div>
        )}

        {typeof depositAmount === 'number' && depositAmount > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>{t('deposit')}</span>
            <span>{money(depositAmount)}</span>
          </div>
        )}
      </div>

      <p className="text-pretty text-xs text-muted-foreground">{t('noChargeNotice')}</p>
    </aside>
  );
}
