'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { formatCurrency, formatDate } from '@/lib/format';
import { usePayouts, type UsePayoutsParams } from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PayoutStatus } from '@/types/invoice';

import { PAYOUT_STATUS_TONE } from './constants';

interface PayoutsTableProps {
  readonly onSelect: (payoutId: number) => void;
}

export function PayoutsTable({ onSelect }: PayoutsTableProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.payouts');
  const tTable = useTranslations('payments.payouts.table');
  const tStatus = useTranslations('payments.payoutStatus');
  const searchParams = useSearchParams();
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;

  const params: UsePayoutsParams = useMemo(
    () => ({
      page,
      per_page: 20,
      status: (searchParams.get('payout_status') as PayoutStatus | null) ?? undefined,
    }),
    [page, searchParams],
  );

  const query = usePayouts(params);

  return (
    <QueryBoundary
      query={query}
      loadingFallback={[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    >
      {(data) => {
        const rows = data.data ?? [];
        if (rows.length === 0) {
          return (
            <EmptyState
              icon={<Banknote className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          );
        }

        return (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{tTable('reference')}</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{tTable('landlord')}</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{tTable('period')}</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{tTable('gross')}</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{tTable('net')}</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{tTable('status')}</th>
                    <th className="px-3 py-2" aria-label={tTable('actions')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((payout) => {
                    const status = payout.status as PayoutStatus;
                    return (
                      <tr key={payout.id} className="text-foreground">
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {payout.reference_number ?? `#${payout.id}`}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">#{payout.landlord_id}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {payout.period_start ? formatDate(payout.period_start, locale) : '—'}
                          {payout.period_end ? (
                            <>
                              {' → '}
                              {formatDate(payout.period_end, locale)}
                            </>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {formatCurrency(payout.gross_amount, locale, {
                            currency: payout.currency || 'XOF',
                          })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                          {formatCurrency(payout.net_amount, locale, {
                            currency: payout.currency || 'XOF',
                          })}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <StatusBadge tone={PAYOUT_STATUS_TONE[status] ?? 'neutral'} label={tStatus(status)} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => onSelect(payout.id)}
                          >
                            {tTable('open')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.meta ? <PropertyPagination meta={data.meta} /> : null}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
