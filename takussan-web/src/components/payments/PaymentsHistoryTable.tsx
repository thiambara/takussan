'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  usePaymentsHistory,
  type PaymentHistoryEntity,
  type UsePaymentsHistoryParams,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PaymentHistoryRow } from '@/types/invoice';

import {
  PAYMENT_STATUS_TONE,
  type PaymentStatus,
} from './constants';

export function PaymentsHistoryTable() {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.history');
  const tTable = useTranslations('payments.history.table');
  const tStatus = useTranslations('payments.status');
  const tMethods = useTranslations('payments.methods');
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
        <Skeleton key={i} className="h-12 rounded-lg" />
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

        const reference = (row: PaymentHistoryRow) => row.reference_number ?? `#${row.id}`;
        const montant = (value: number, row: PaymentHistoryRow) =>
          formatCurrency(value, locale, { currency: row.currency || 'XOF' });
        const acompte = (row: PaymentHistoryRow) =>
          row.remaining_amount > 0 && row.remaining_amount < row.amount
            ? tTable('paidAmount', { amount: montant(row.paid_amount, row) })
            : null;
        const statut = (row: PaymentHistoryRow) => {
          const status = (row.status ?? 'pending') as PaymentStatus;
          return <StatusBadge tone={PAYMENT_STATUS_TONE[status] ?? 'neutral'} label={tStatus(status)} />;
        };
        // « Bank Transfer » s'affichait en anglais : l'enum brut, capitalisé.
        const moyen = (row: PaymentHistoryRow) =>
          row.payment_method
            ? tMethods.has(row.payment_method)
              ? tMethods(row.payment_method)
              : row.payment_method.replace(/_/g, ' ')
            : '—';
        const entite = (row: PaymentHistoryRow, className?: string) => {
          const label = row.lease_id
            ? tTable('entityLease', { id: String(row.lease_id) })
            : row.booking_id
              ? tTable('entityBooking', { id: String(row.booking_id) })
              : '—';
          const href = row.lease_id
            ? `/app/leases/${row.lease_id}`
            : row.booking_id
              ? `/app/bookings/${row.booking_id}`
              : null;
          return href ? (
            <Link href={href} className={cn('underline-offset-2 hover:underline', className)}>
              {label}
            </Link>
          ) : (
            <span>{label}</span>
          );
        };

        const colonnes: DataTableColumn<PaymentHistoryRow>[] = [
          {
            id: 'reference',
            header: tTable('reference'),
            className: 'whitespace-nowrap',
            cell: (row) => (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{reference(row)}</span>
            ),
          },
          {
            id: 'source',
            header: tTable('source'),
            className: 'whitespace-nowrap',
            cell: (row) => <span className="text-xs">{tTable(`sources.${row.source}`)}</span>,
          },
          {
            id: 'date',
            header: tTable('date'),
            className: 'whitespace-nowrap',
            cell: (row) => <span className="text-xs">{row.date ? formatDate(row.date, locale) : '—'}</span>,
          },
          {
            id: 'amount',
            header: tTable('amount'),
            align: 'end',
            className: 'whitespace-nowrap',
            cell: (row) => (
              <>
                <span className="font-semibold">{montant(row.amount, row)}</span>
                {acompte(row) ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{acompte(row)}</span>
                ) : null}
              </>
            ),
          },
          {
            id: 'status',
            header: tTable('status'),
            className: 'whitespace-nowrap',
            cell: statut,
          },
          {
            id: 'method',
            header: tTable('method'),
            className: 'whitespace-nowrap',
            cell: (row) => <span className="text-xs">{moyen(row)}</span>,
          },
          {
            id: 'entity',
            header: tTable('entity'),
            className: 'whitespace-nowrap',
            cell: (row) => <span className="text-xs">{entite(row)}</span>,
          },
        ];

        return (
          <div className="space-y-4">
          {/* TCK-2331 (P08.07) — sous `md`, une carte par paiement : le lien vers le bail ou la
              réservation, en dernière colonne, ne s'atteignait qu'après un défilement horizontal. */}
          <DataTable
            caption={tTable('caption')}
            columns={colonnes}
            rows={rows}
            rowKey={(row) => `${row.source}-${row.id}`}
            carteMobile={(row) => (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      {reference(row)} · {tTable(`sources.${row.source}`)}
                    </p>
                    <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                      {montant(row.amount, row)}
                    </p>
                    {acompte(row) ? (
                      <p className="text-xs text-muted-foreground tabular-nums">{acompte(row)}</p>
                    ) : null}
                  </div>
                  {statut(row)}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.date ? formatDate(row.date, locale) : '—'} · {moyen(row)}
                </p>
                <p className="mt-2 text-sm">
                  {entite(row, 'inline-flex min-h-11 items-center font-medium text-primary')}
                </p>
              </>
            )}
          />

          {totals ? (
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-card p-3 text-xs text-muted-foreground tabular-nums lg:grid-cols-4">
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
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
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
