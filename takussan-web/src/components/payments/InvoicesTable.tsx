'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { useInvoices, type UseInvoicesParams } from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { InvoiceStatus } from '@/types/invoice';

import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
} from './constants';

interface InvoicesTableProps {
  readonly onSelect: (invoiceId: number) => void;
}

export function InvoicesTable({ onSelect }: InvoicesTableProps) {
  const locale = useLocale() as Locale;
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

  const { data, isLoading, isError, error } = useInvoices(params);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        <AlertCircle className="mr-2 inline size-4" aria-hidden="true" />
        {error instanceof ApiError
          ? error.displayMessage
          : 'Impossible de charger les factures.'}
      </p>
    );
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Aucune facture pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-app-surface-1 text-xs uppercase tracking-wide text-app-ink-muted">
            <tr>
              <th className="px-3 py-2">Référence</th>
              <th className="px-3 py-2">Émise le</th>
              <th className="px-3 py-2">Échéance</th>
              <th className="px-3 py-2">Montant</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((invoice) => {
              const status = invoice.status as InvoiceStatus;
              return (
                <tr key={invoice.id} className="text-app-ink">
                  <td className="px-3 py-2 font-mono text-xs text-app-ink-muted">
                    {invoice.reference_number ?? `#${invoice.id}`}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {invoice.issue_date ? formatDate(invoice.issue_date, locale) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {invoice.due_date ? formatDate(invoice.due_date, locale) : '—'}
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {formatCurrency(invoice.total_amount, locale, {
                      currency: invoice.currency || 'XOF',
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={INVOICE_STATUS_VARIANT[status] ?? 'outline'}>
                      {INVOICE_STATUS_LABEL[status] ?? status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-app-accent hover:underline"
                      onClick={() => onSelect(invoice.id)}
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data?.meta ? <PropertyPagination meta={data.meta} /> : null}
    </div>
  );
}
