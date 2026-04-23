'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { usePayouts, type UsePayoutsParams } from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PayoutStatus } from '@/types/invoice';

import {
  PAYOUT_STATUS_LABEL,
  PAYOUT_STATUS_VARIANT,
} from './constants';

interface PayoutsTableProps {
  readonly onSelect: (payoutId: number) => void;
}

export function PayoutsTable({ onSelect }: PayoutsTableProps) {
  const locale = useLocale() as Locale;
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

  const { data, isLoading, isError, error } = usePayouts(params);

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
          : 'Impossible de charger les payouts.'}
      </p>
    );
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Aucun reversement pour le moment.
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
              <th className="px-3 py-2">Bailleur</th>
              <th className="px-3 py-2">Période</th>
              <th className="px-3 py-2">Brut</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((payout) => {
              const status = payout.status as PayoutStatus;
              return (
                <tr key={payout.id} className="text-app-ink">
                  <td className="px-3 py-2 font-mono text-xs text-app-ink-muted">
                    {payout.reference_number ?? `#${payout.id}`}
                  </td>
                  <td className="px-3 py-2 text-xs">#{payout.landlord_id}</td>
                  <td className="px-3 py-2 text-xs">
                    {payout.period_start ? formatDate(payout.period_start, locale) : '—'}
                    {payout.period_end ? (
                      <>
                        {' → '}
                        {formatDate(payout.period_end, locale)}
                      </>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatCurrency(payout.gross_amount, locale, {
                      currency: payout.currency || 'XOF',
                    })}
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {formatCurrency(payout.net_amount, locale, {
                      currency: payout.currency || 'XOF',
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={PAYOUT_STATUS_VARIANT[status] ?? 'outline'}>
                      {PAYOUT_STATUS_LABEL[status] ?? status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-app-accent hover:underline"
                      onClick={() => onSelect(payout.id)}
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
