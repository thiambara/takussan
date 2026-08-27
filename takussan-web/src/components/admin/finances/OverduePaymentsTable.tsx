'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CircleCheckBig } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { DataTable, StatusBadge, type DataTableColumn } from '@/components/console';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  usePaymentsHistory,
  type UsePaymentsHistoryParams,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PaymentHistoryRow } from '@/types/invoice';

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

  const columns: readonly DataTableColumn<PaymentHistoryRow>[] = [
    {
      id: 'reference',
      header: tTable('reference'),
      // La typographie de la CELLULE se pose dans la cellule : `className` va aussi sur le `<th>`,
      // et un en-tête en chasse fixe n'est pas ce qu'on demandait.
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.reference_number ?? `#${row.id}`}
        </span>
      ),
    },
    {
      id: 'source',
      header: tTable('source'),
      className: 'text-xs',
      cell: (row) => tTable(`sources.${row.source}`),
    },
    {
      id: 'dueDate',
      header: tTable('dueDate'),
      className: 'text-xs',
      cell: (row) => {
        const dueDate = row.due_date ?? row.period_start ?? row.date ?? null;
        return dueDate ? formatDate(dueDate, locale) : '—';
      },
    },
    {
      id: 'amount',
      header: tTable('amount'),
      className: 'font-semibold',
      cell: (row) => formatCurrency(row.amount, locale, { currency: row.currency || 'XOF' }),
    },
    {
      id: 'remaining',
      header: tTable('remaining'),
      cell: (row) => (
        <span className="font-semibold text-destructive">
          {formatCurrency(row.remaining_amount, locale, { currency: row.currency || 'XOF' })}
        </span>
      ),
    },
    {
      id: 'status',
      header: tTable('status'),
      // L'onglet épingle `filter[status]=late` : toute ligne qui arrive ici est en retard.
      cell: () => <StatusBadge tone="danger" label={tStatus('late')} />,
    },
    {
      id: 'entity',
      header: tTable('entity'),
      className: 'text-xs',
      cell: (row) => {
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
        return entityHref ? (
          <Link
            href={entityHref}
            className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {entityLabel}
          </Link>
        ) : (
          <span>{entityLabel}</span>
        );
      },
    },
  ];

  return (
    <QueryBoundary
      query={query}
      loadingFallback={
        <div className="space-y-3" data-testid="overdue-payments-loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
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
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
            <DataTable
              caption={t('tableCaption')}
              columns={columns}
              rows={rows}
              rowKey={(row) => `${row.source}-${row.id}`}
              density="compact"
              data-testid="overdue-payments-table"
              className="rounded-none ring-0"
            />
            {data.meta.total ? (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                {t('count', { count: data.meta.total })}
              </p>
            ) : null}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
