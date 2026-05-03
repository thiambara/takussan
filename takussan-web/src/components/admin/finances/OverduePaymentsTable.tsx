'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  usePaymentsHistory,
  type UsePaymentsHistoryParams,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
} from '@/components/payments/constants';

const SOURCE_LABEL: Record<'booking' | 'lease', string> = {
  booking: 'Réservation',
  lease: 'Bail',
};

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

  const { data, isLoading, isError, error } = usePaymentsHistory(params);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="overdue-payments-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600" role="alert">
        <AlertCircle className="mr-2 inline size-4" aria-hidden="true" />
        {error instanceof ApiError
          ? error.displayMessage
          : 'Impossible de charger les impayés.'}
      </p>
    );
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return (
      <div
        data-testid="overdue-payments-empty"
        className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500"
      >
        Aucun impayé en cours — bonne nouvelle !
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-left text-sm" data-testid="overdue-payments-table">
        <thead className="bg-app-surface-1 text-xs uppercase tracking-wide text-app-ink-muted">
          <tr>
            <th className="px-3 py-2">Référence</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Échéance</th>
            <th className="px-3 py-2">Montant</th>
            <th className="px-3 py-2">Restant dû</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Entité</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((row) => {
            const dueDate = row.due_date ?? row.period_start ?? row.date ?? null;
            const entityLabel = row.lease_id
              ? `Bail #${row.lease_id}`
              : row.booking_id
                ? `Réservation #${row.booking_id}`
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
                <td className="px-3 py-2 text-xs">{SOURCE_LABEL[row.source]}</td>
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
                  <Badge variant={PAYMENT_STATUS_VARIANT.late}>
                    {PAYMENT_STATUS_LABEL.late}
                  </Badge>
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
      {data?.meta.total ? (
        <p className="border-t border-stone-100 px-3 py-2 text-xs text-app-ink-muted">
          {data.meta.total} impayé{data.meta.total > 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  );
}
