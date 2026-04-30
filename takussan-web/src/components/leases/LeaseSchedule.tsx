'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useLeasePayments } from '@/lib/queries/leases';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { Locale } from '@/i18n/config';
import type { LeasePayment } from '@/types/lease';
import { cn } from '@/lib/utils';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';

interface LeaseScheduleProps {
  readonly leaseId: number;
  /** Agency owning the lease — drives which gateway providers are available. */
  readonly agencyId?: number | null;
}

/**
 * Derived display status — `late` payments are computed client-side when
 * the server hasn't flagged them yet (due date in the past and status ≠ paid).
 */
function displayStatus(p: LeasePayment): 'paid' | 'late' | 'pending' | 'other' {
  if (p.status === 'paid') return 'paid';
  if (p.status === 'pending' && p.due_date) {
    const due = new Date(p.due_date);
    if (!Number.isNaN(due.getTime()) && due < new Date()) return 'late';
  }
  if (p.status === 'late') return 'late';
  if (p.status === 'pending') return 'pending';
  return 'other';
}

const STATUS_LABEL: Record<ReturnType<typeof displayStatus>, string> = {
  paid: 'Payé',
  late: 'En retard',
  pending: 'À venir',
  other: 'Autre',
};

export function LeaseSchedule({ leaseId, agencyId }: LeaseScheduleProps) {
  const locale = useLocale() as Locale;
  const { data, isLoading, isError } = useLeasePayments(leaseId);
  const { providers } = usePaymentProviders(agencyId ?? null);

  const payments = useMemo(() => data?.data ?? [], [data]);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-app-surface-1" />;
  }
  if (isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-4 text-sm text-red-600">
        Impossible de charger l&apos;échéancier.
      </p>
    );
  }
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
        Aucun paiement pour l&apos;instant. Générez l&apos;échéancier pour le créer
        automatiquement.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
          <tr>
            <th className="px-4 py-2 font-medium">Période</th>
            <th className="px-4 py-2 font-medium">Échéance</th>
            <th className="px-4 py-2 font-medium">Montant</th>
            <th className="px-4 py-2 font-medium">Statut</th>
            <th className="px-4 py-2 font-medium" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {payments.map((p) => {
            const st = displayStatus(p);
            return (
              <tr
                key={p.id}
                className={cn(
                  'transition-colors',
                  st === 'late' && 'bg-red-50/50',
                )}
              >
                <td className="px-4 py-2 text-stone-700">
                  {formatDate(p.period_start, locale)} →{' '}
                  {formatDate(p.period_end, locale)}
                </td>
                <td className="px-4 py-2 text-stone-700">
                  {p.due_date ? formatDate(p.due_date, locale) : '—'}
                </td>
                <td className="px-4 py-2 font-medium text-stone-900">
                  {formatCurrency(p.amount, locale)}
                  {typeof p.late_fee === 'number' && p.late_fee > 0 && (
                    <span className="ml-1 text-xs text-red-600">
                      +{formatCurrency(p.late_fee, locale)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant={
                      st === 'paid'
                        ? 'default'
                        : st === 'late'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {STATUS_LABEL[st]}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  {st !== 'paid' && (
                    <PayOnlineButton
                      paymentType="lease-payments"
                      paymentId={p.id}
                      currency={p.currency}
                      availableProviders={providers}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
