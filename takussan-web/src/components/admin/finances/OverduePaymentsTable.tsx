'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CircleCheckBig } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  usePaymentsHistory,
  type UsePaymentsHistoryParams,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import { PAYMENT_STATUS_VARIANT } from '@/components/payments/constants';

/**
 * TCK-134 — "Impayés" tab on `/admin/finances`. Re-uses the consolidated
 * `/api/payments/history` endpoint with `filter[status]=late` hard-pinned
 * (the user can't override it from this tab — that surface lives on the
 * "Encaissements" tab via `PaymentsHistoryFilters`). The table is
 * intentionally read-only here; the per-payment "Marquer payé" action
 * is exposed from the entity detail pages (`/app/leases/{id}` etc.) and
 * is **out of scope** for this admin overview (cf. the ticket "Hors
 * périmètre").
 */
export function OverduePaymentsTable() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.finances.overdue');
  const tTable = useTranslations('admin.finances.overdue.table');
  const tStatus = useTranslations('payments.status');
  const searchParams = useSearchParams();

  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const params: UsePaymentsHistoryParams = useMemo(
    () => ({
      page,
      per_page: 20,
      status: 'late',
      sort: '-date',
    }),
    [page],
  );

  const query = usePaymentsHistory(params);

  return (
    <QueryBoundary
      query={query}
      loadingFallback={
        <div className="space-y-3" data-testid="overdue-payments-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-app-surface-1" />
          ))}
        </div>
      }
    >
      {(data) => {
        const rows = data.data ?? [];
        if (rows.length === 0) {
          return (
            <EmptyState
              data-testid="overdue-payments-empty"
              icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          );
        }

        return (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm" data-testid="overdue-payments-table">
              <thead className="bg-app-surface-1 text-xs uppercase tracking-wide text-app-ink-muted">
                <tr>
                  <th className="px-3 py-2">{tTable('reference')}</th>
                  <th className="px-3 py-2">{tTable('source')}</th>
                  <th className="px-3 py-2">{tTable('dueDate')}</th>
                  <th className="px-3 py-2">{tTable('amount')}</th>
                  <th className="px-3 py-2">{tTable('remaining')}</th>
                  <th className="px-3 py-2">{tTable('status')}</th>
                  <th className="px-3 py-2">{tTable('entity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((row) => {
                  const dueDate = row.due_date ?? row.period_start ?? row.date ?? null;
                  const entityLabel = row.lease_id
                    ? tTable('leaseEntity', { id: String(row.lease_id) })
                    : row.booking_id
                      ? tTable('bookingEntity', { id: String(row.booking_id) })
                      : '—';
                  const entityHref = row.lease_id
                    ? `/app/leases/${row.lease_id}`
                    : row.booking_id
                      ? `/app/bookings/${row.booking_id}`
                      : null;

                  return (
                    <tr key={`${row.source}-${row.id}`} className="text-app-ink">
                      <td className="px-3 py-2 font-mono text-xs text-app-ink-muted">
                        {row.reference_number ?? `#${row.id}`}
                      </td>
                      <td className="px-3 py-2 text-xs">{tTable(`sources.${row.source}`)}</td>
                      <td className="px-3 py-2 text-xs">
                        {dueDate ? formatDate(dueDate, locale) : '—'}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {formatCurrency(row.amount, locale, { currency: row.currency || 'XOF' })}
                      </td>
                      <td className="px-3 py-2 font-semibold text-destructive">
                        {formatCurrency(row.remaining_amount, locale, {
                          currency: row.currency || 'XOF',
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={PAYMENT_STATUS_VARIANT.late}>{tStatus('late')}</Badge>
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
            {data.meta.total ? (
              <p className="border-t border-stone-100 px-3 py-2 text-xs text-app-ink-muted">
                {t('count', { count: data.meta.total })}
              </p>
            ) : null}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
