'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
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
  const isRent = property.contract_type === 'rent';
  const periodLabel = property.rent_period_label ?? (isRent ? 'mois' : null);

  return (
    <aside className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm space-y-4 lg:sticky lg:top-24">
      <div className="flex items-start gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
          {property.main_photo_url ? (
            <Image
              src={property.main_photo_url}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-stone-900 line-clamp-2">
            {property.title}
          </h3>
          {property.location?.city && (
            <p className="mt-0.5 text-xs text-stone-500">{property.location.city}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-stone-100 pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-stone-500">Prix affiché</span>
          <span className="font-medium text-stone-900">
            {formatCurrency(property.price, locale)}
            {periodLabel && <span className="ml-1 text-xs text-stone-500">/ {periodLabel}</span>}
          </span>
        </div>

        {startDate && (
          <div className="flex justify-between">
            <span className="text-stone-500">Arrivée</span>
            <span className="text-stone-900">{formatDate(startDate, locale)}</span>
          </div>
        )}
        {endDate && (
          <div className="flex justify-between">
            <span className="text-stone-500">Départ</span>
            <span className="text-stone-900">{formatDate(endDate, locale)}</span>
          </div>
        )}

        {typeof nights === 'number' && nights > 0 && (
          <div className="flex justify-between text-xs text-stone-500">
            <span>Durée</span>
            <span>
              {nights} nuit{nights > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {typeof totalAmount === 'number' && totalAmount > 0 && (
          <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-semibold text-stone-900">
            <span>Total estimé</span>
            <span>{formatCurrency(totalAmount, locale)}</span>
          </div>
        )}

        {typeof depositAmount === 'number' && depositAmount > 0 && (
          <div className="flex justify-between text-xs text-stone-500">
            <span>Acompte attendu</span>
            <span>{formatCurrency(depositAmount, locale)}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500">
        Vous ne serez pas débité avant confirmation par le propriétaire ou l&apos;agent.
      </p>
    </aside>
  );
}
