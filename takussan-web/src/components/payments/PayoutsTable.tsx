'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { formatCurrency, formatDate } from '@/lib/format';
import { usePayouts, type UsePayoutsParams } from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PayoutStatus } from '@/types/invoice';

import { PAYOUT_STATUS_VARIANT } from './constants';

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
        <div key={i} className="h-12 animate-pulse rounded-lg bg-card" />
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
              <table className="w-full text-left text-sm">
                <thead className="bg-card text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{tTable('reference')}</th>
                    <th className="px-3 py-2">{tTable('landlord')}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{tTable('period')}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{tTable('gross')}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{tTable('net')}</th>
                    <th className="px-3 py-2 whitespace-nowrap">{tTable('status')}</th>
                    <th className="px-3 py-2" aria-label={tTable('actions')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((payout) => {
                    const status = payout.status as PayoutStatus;
                    return (
                      <tr key={payout.id} className="text-foreground">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {payout.reference_number ?? `#${payout.id}`}
                        </td>
                        <td className="px-3 py-2 text-xs">#{payout.landlord_id}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {payout.period_start ? formatDate(payout.period_start, locale) : '—'}
                          {payout.period_end ? (
                            <>
                              {' → '}
                              {formatDate(payout.period_end, locale)}
                            </>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {formatCurrency(payout.gross_amount, locale, {
                            currency: payout.currency || 'XOF',
                          })}
                        </td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {formatCurrency(payout.net_amount, locale, {
                            currency: payout.currency || 'XOF',
                          })}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge variant={PAYOUT_STATUS_VARIANT[status] ?? 'outline'}>
                            {tStatus(status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
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
