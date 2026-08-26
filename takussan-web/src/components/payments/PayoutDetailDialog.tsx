'use client';

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { formatCurrency, formatDate } from '@/lib/format';
import {
  usePayout,
  usePayoutCancel,
  usePayoutMarkFailed,
  usePayoutMarkProcessed,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PayoutStatus } from '@/types/invoice';

import { PAYOUT_STATUS_VARIANT } from './constants';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface PayoutDetailDialogProps {
  readonly payoutId: number | null;
  readonly onClose: () => void;
}

export function PayoutDetailDialog({ payoutId, onClose }: PayoutDetailDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.payoutDetail');
  const tStatus = useTranslations('payments.payoutStatus');
  const messageErreur = useMessageErreurApi();
  const { data, isLoading, isError, error } = usePayout(payoutId);
  const markProcessed = usePayoutMarkProcessed(payoutId ?? 0);
  const markFailed = usePayoutMarkFailed(payoutId ?? 0);
  const cancel = usePayoutCancel(payoutId ?? 0);

  const [transactionId, setTransactionId] = useState('');
  const [failedReason, setFailedReason] = useState('');

  const handleAction = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      // surface via mutation.isError if needed
    }
  }, []);

  const payout = data?.data;
  const status = (payout?.status ?? 'pending') as PayoutStatus;

  return (
    <Dialog open={payoutId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('title', { reference: payout?.reference_number ?? `#${payoutId}` })}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-card" />
        ) : isError ? (
          <p className="rounded-xl bg-card p-4 text-sm text-red-600">
            {messageErreur(error, t('notFound'))}
          </p>
        ) : payout ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={PAYOUT_STATUS_VARIANT[status] ?? 'outline'}>
                {tStatus(status)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('createdOn', {
                  date: payout.created_at ? formatDate(payout.created_at, locale) : '—',
                })}
              </span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('landlord')}</dt>
                <dd className="mt-0.5 text-foreground">#{payout.landlord_id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('period')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {payout.period_start ? formatDate(payout.period_start, locale) : '—'}
                  {payout.period_end ? (
                    <>
                      {' → '}
                      {formatDate(payout.period_end, locale)}
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('gross')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {formatCurrency(payout.gross_amount, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('commission')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {formatCurrency(payout.commission_amount, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('fees')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {formatCurrency(payout.fees_amount ?? 0, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('net')}</dt>
                <dd className="mt-0.5 font-semibold text-foreground">
                  {formatCurrency(payout.net_amount, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              {payout.payment_method ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('method')}</dt>
                  <dd className="mt-0.5 capitalize text-foreground">
                    {payout.payment_method.replace(/_/g, ' ')}
                  </dd>
                </div>
              ) : null}
              {payout.processed_at ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('processedOn')}</dt>
                  <dd className="mt-0.5 text-foreground">
                    {formatDate(payout.processed_at, locale)}
                  </dd>
                </div>
              ) : null}
              {payout.failed_reason ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-destructive">{t('failedReason')}</dt>
                  <dd className="mt-0.5 text-foreground">{payout.failed_reason}</dd>
                </div>
              ) : null}
            </dl>

            {(status === 'pending' || status === 'scheduled' || status === 'processing') ? (
              <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
                <div>
                  <Label htmlFor="transaction-id" className="mb-1.5 block text-xs font-medium">
                    {t('transactionId')}
                  </Label>
                  <Input
                    id="transaction-id"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder={t('transactionIdPlaceholder')}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={markProcessed.isPending}
                    onClick={() =>
                      void handleAction(() =>
                        markProcessed.mutateAsync({
                          transaction_id: transactionId || undefined,
                        }),
                      )
                    }
                  >
                    {markProcessed.isPending ? t('working') : t('markProcessed')}
                  </Button>
                </div>
                <div>
                  <Label htmlFor="failed-reason" className="mb-1.5 block text-xs font-medium">
                    {t('failedReason')}
                  </Label>
                  <Input
                    id="failed-reason"
                    value={failedReason}
                    onChange={(e) => setFailedReason(e.target.value)}
                    placeholder={t('failedReasonPlaceholder')}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={markFailed.isPending || !failedReason.trim()}
                    onClick={() =>
                      void handleAction(() =>
                        markFailed.mutateAsync({ failed_reason: failedReason.trim() }),
                      )
                    }
                  >
                    {markFailed.isPending ? t('working') : t('markFailed')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => void handleAction(() => cancel.mutateAsync())}
                  >
                    {cancel.isPending ? t('working') : t('cancel')}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button variant="ghost" type="button" onClick={onClose}>
                {t('close')}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
