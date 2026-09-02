'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { useLeasePayments } from '@/lib/queries/leases';
import { EmptyState, ErrorState } from '@/components/feedback';
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

export function LeaseSchedule({ leaseId, agencyId }: LeaseScheduleProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.schedule');
  const tScheduleStatus = useTranslations('lease.schedule.status');
  const tCommon = useTranslations('common');
  const paymentsQuery = useLeasePayments(leaseId);
  const { data, isLoading, isError } = paymentsQuery;
  const { providers } = usePaymentProviders(agencyId ?? null);

  const payments = useMemo(() => data?.data ?? [], [data]);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-card" />;
  }
  if (isError) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void paymentsQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-8" aria-hidden="true" />}
        title={t('empty_title')}
        description={t('empty_description')}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium whitespace-nowrap">{t('colPeriod')}</th>
            <th className="px-4 py-2 font-medium whitespace-nowrap">{t('colDueDate')}</th>
            <th className="px-4 py-2 font-medium whitespace-nowrap">{t('colAmount')}</th>
            <th className="px-4 py-2 font-medium whitespace-nowrap">{t('colStatus')}</th>
            <th className="px-4 py-2 font-medium" aria-label={t('colActions')} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {payments.map((p) => {
            const st = displayStatus(p);
            return (
              <tr
                key={p.id}
                className={cn(
                  'transition-colors',
                  st === 'late' && 'bg-destructive/10',
                )}
              >
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                  {formatDate(p.period_start, locale)} →{' '}
                  {formatDate(p.period_end, locale)}
                </td>
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                  {p.due_date ? formatDate(p.due_date, locale) : '—'}
                </td>
                <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">
                  {formatCurrency(p.amount, locale)}
                  {typeof p.late_fee === 'number' && p.late_fee > 0 && (
                    <span className="ml-1 text-xs text-destructive">
                      +{formatCurrency(p.late_fee, locale)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <Badge
                    variant={
                      st === 'paid'
                        ? 'default'
                        : st === 'late'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {tScheduleStatus(st)}
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
