'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  usePaymentsHistory,
  type PaymentHistoryEntity,
  type UsePaymentsHistoryParams,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';

import {
  PAYMENT_STATUS_VARIANT,
  type PaymentStatus,
} from './constants';

export function PaymentsHistoryTable() {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.history');
  const tTable = useTranslations('payments.history.table');
  const tStatus = useTranslations('payments.status');
  const searchParams = useSearchParams();

  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const params: UsePaymentsHistoryParams = useMemo(() => {
    const status = searchParams.get('status') ?? undefined;
    const entity_type = (searchParams.get('entity_type') as
      | PaymentHistoryEntity
      | null) ?? undefined;
    const entity_id_raw = searchParams.get('entity_id');
    const entity_id = entity_id_raw
      ? Number.parseInt(entity_id_raw, 10) || undefined
      : undefined;
    const date_from = searchParams.get('date_from') ?? undefined;
    const date_to = searchParams.get('date_to') ?? undefined;
    return {
      page,
      per_page: 20,
      status: status || undefined,
      entity_type: entity_type || undefined,
      entity_id,
      date_from,
      date_to,
    };
  }, [page, searchParams]);

  const query = usePaymentsHistory(params);

  return (
    <QueryBoundary
      query={query}
      loadingFallback={[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-card" />
      ))}
    >
      {(data) => {
        const rows = data.data ?? [];
        const totals = data.meta.totals;

        if (rows.length === 0) {
          return (
            <EmptyState
              icon={<Wallet className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          );
        }

        return (
          <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{tTable('reference')}</th>
                  <th className="px-3 py-2">{tTable('source')}</th>
                  <th className="px-3 py-2">{tTable('date')}</th>
                  <th className="px-3 py-2">{tTable('amount')}</th>
                  <th className="px-3 py-2">{tTable('status')}</th>
                  <th className="px-3 py-2">{tTable('method')}</th>
                  <th className="px-3 py-2">{tTable('entity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const status = (row.status ?? 'pending') as PaymentStatus;
                  const entityLabel = row.lease_id
                    ? tTable('entityLease', { id: String(row.lease_id) })
                    : row.booking_id
                      ? tTable('entityBooking', { id: String(row.booking_id) })
                      : '—';
                  const entityHref = row.lease_id
                    ? `/app/leases/${row.lease_id}`
                    : row.booking_id
                      ? `/app/bookings/${row.booking_id}`
                      : null;

                  return (
                    <tr key={`${row.source}-${row.id}`} className="text-foreground">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {row.reference_number ?? `#${row.id}`}
                      </td>
                      <td className="px-3 py-2 text-xs">{tTable(`sources.${row.source}`)}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.date ? formatDate(row.date, locale) : '—'}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {formatCurrency(row.amount, locale, {
                          currency: row.currency || 'XOF',
                        })}
                        {row.remaining_amount > 0 && row.remaining_amount < row.amount ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {tTable('paidAmount', {
                              amount: formatCurrency(row.paid_amount, locale, {
                                currency: row.currency || 'XOF',
                              }),
                            })}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={PAYMENT_STATUS_VARIANT[status] ?? 'outline'}>
                          {tStatus(status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">
                        {row.payment_method?.replace(/_/g, ' ') ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {entityHref ? (
                          <Link href={entityHref} className="underline-offset-2 hover:underline">
                            {entityLabel}
                          </Link>
                        ) : (
                          <span>{entityLabel}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totals ? (
            <dl className="grid gap-2 rounded-xl bg-card p-3 text-xs text-muted-foreground sm:grid-cols-4">
              <div>
                <dt>{tTable('total')}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {formatCurrency(totals.amount, locale)}
                </dd>
              </div>
              <div>
                <dt>{tTable('paid')}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {formatCurrency(totals.paid_amount, locale)}
                </dd>
              </div>
              <div>
                <dt>{tTable('remaining')}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {formatCurrency(totals.remaining_amount, locale)}
                </dd>
              </div>
              <div>
                <dt>{tTable('rows')}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {totals.count}
                  {data.meta.truncated ? (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      {tTable('cap', { limit: String(data.meta.limit) })}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          ) : null}

          {data.meta ? <PropertyPagination meta={data.meta} /> : null}
        </div>
        );
      }}
    </QueryBoundary>
  );
}
