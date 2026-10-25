'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ReceiptText } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { formatCurrency, formatDate } from '@/lib/format';
import { useInvoices, type UseInvoicesParams } from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { Invoice, InvoiceStatus } from '@/types/invoice';

import { INVOICE_STATUS_TONE } from './constants';

interface InvoicesTableProps {
  readonly onSelect: (invoiceId: number) => void;
}

export function InvoicesTable({ onSelect }: InvoicesTableProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.invoices');
  const tTable = useTranslations('payments.invoices.table');
  const tStatus = useTranslations('payments.invoiceStatus');
  const searchParams = useSearchParams();

  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;

  const params: UseInvoicesParams = useMemo(
    () => ({
      page,
      per_page: 20,
      status: (searchParams.get('invoice_status') as InvoiceStatus | null) ?? undefined,
    }),
    [page, searchParams],
  );

  const query = useInvoices(params);

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
              icon={<ReceiptText className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          );
        }

        const reference = (invoice: Invoice) => invoice.reference_number ?? `#${invoice.id}`;
        const montant = (invoice: Invoice) =>
          formatCurrency(invoice.total_amount, locale, { currency: invoice.currency || 'XOF' });
        const jour = (value: string | null | undefined) => (value ? formatDate(value, locale) : '—');
        const statut = (invoice: Invoice) => {
          const status = invoice.status as InvoiceStatus;
          return <StatusBadge tone={INVOICE_STATUS_TONE[status] ?? 'neutral'} label={tStatus(status)} />;
        };

        const colonnes: DataTableColumn<Invoice>[] = [
          {
            id: 'reference',
            header: tTable('reference'),
            className: 'whitespace-nowrap',
            cell: (invoice) => (
              <span className="font-mono text-xs text-muted-foreground">{reference(invoice)}</span>
            ),
          },
          {
            id: 'issuedOn',
            header: tTable('issuedOn'),
            className: 'whitespace-nowrap',
            cell: (invoice) => <span className="text-xs">{jour(invoice.issue_date)}</span>,
          },
          {
            id: 'dueDate',
            header: tTable('dueDate'),
            className: 'whitespace-nowrap',
            cell: (invoice) => <span className="text-xs">{jour(invoice.due_date)}</span>,
          },
          {
            id: 'amount',
            header: tTable('amount'),
            align: 'end',
            className: 'whitespace-nowrap',
            cell: (invoice) => <span className="font-semibold">{montant(invoice)}</span>,
          },
          {
            id: 'status',
            header: tTable('status'),
            className: 'whitespace-nowrap',
            cell: statut,
          },
          {
            id: 'actions',
            header: tTable('actions'),
            headerSrOnly: true,
            align: 'end',
            cell: (invoice) => (
              <button
                type="button"
                className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelect(invoice.id)}
                aria-label={tTable('openLabel', { reference: reference(invoice) })}
              >
                {tTable('open')}
              </button>
            ),
          },
        ];

        return (
          <div className="space-y-3">
            {/* TCK-2331 (P08.07) — sous `md`, une carte par facture : « Ouvrir » ne s'atteignait
                qu'après un défilement horizontal de la table. */}
            <DataTable
              caption={tTable('caption')}
              columns={colonnes}
              rows={rows}
              rowKey={(invoice) => invoice.id}
              carteMobile={(invoice) => (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{reference(invoice)}</p>
                      <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                        {montant(invoice)}
                      </p>
                    </div>
                    {statut(invoice)}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
                    <div>
                      <dt>{tTable('issuedOn')}</dt>
                      <dd className="text-foreground">{jour(invoice.issue_date)}</dd>
                    </div>
                    <div>
                      <dt>{tTable('dueDate')}</dt>
                      <dd className="text-foreground">{jour(invoice.due_date)}</dd>
                    </div>
                  </dl>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-11 w-full"
                    onClick={() => onSelect(invoice.id)}
                    aria-label={tTable('openLabel', { reference: reference(invoice) })}
                  >
                    {tTable('open')}
                  </Button>
                </>
              )}
            />
            {data.meta ? <PropertyPagination meta={data.meta} /> : null}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
