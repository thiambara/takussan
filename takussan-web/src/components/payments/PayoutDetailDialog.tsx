'use client';

import { useCallback, useState } from 'react';
import { useLocale } from 'next-intl';

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
import { ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  usePayout,
  usePayoutCancel,
  usePayoutMarkFailed,
  usePayoutMarkProcessed,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PayoutStatus } from '@/types/invoice';

import {
  PAYOUT_STATUS_LABEL,
  PAYOUT_STATUS_VARIANT,
} from './constants';

interface PayoutDetailDialogProps {
  readonly payoutId: number | null;
  readonly onClose: () => void;
}

export function PayoutDetailDialog({ payoutId, onClose }: PayoutDetailDialogProps) {
  const locale = useLocale() as Locale;
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
            Reversement {payout?.reference_number ?? `#${payoutId}`}
          </DialogTitle>
          <DialogDescription>Transitions de statut du payout.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-app-surface-1" />
        ) : isError ? (
          <p className="rounded-xl bg-app-surface-1 p-4 text-sm text-red-600">
            {error instanceof ApiError ? error.displayMessage : 'Reversement introuvable.'}
          </p>
        ) : payout ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={PAYOUT_STATUS_VARIANT[status] ?? 'outline'}>
                {PAYOUT_STATUS_LABEL[status] ?? status}
              </Badge>
              <span className="text-xs text-app-ink-muted">
                Créé le {payout.created_at ? formatDate(payout.created_at, locale) : '—'}
              </span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Bailleur</dt>
                <dd className="mt-0.5 text-app-ink">#{payout.landlord_id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Période</dt>
                <dd className="mt-0.5 text-app-ink">
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
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Brut</dt>
                <dd className="mt-0.5 text-app-ink">
                  {formatCurrency(payout.gross_amount, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Commission</dt>
                <dd className="mt-0.5 text-app-ink">
                  {formatCurrency(payout.commission_amount, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Frais</dt>
                <dd className="mt-0.5 text-app-ink">
                  {formatCurrency(payout.fees_amount ?? 0, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Net</dt>
                <dd className="mt-0.5 font-semibold text-app-ink">
                  {formatCurrency(payout.net_amount, locale, {
                    currency: payout.currency || 'XOF',
                  })}
                </dd>
              </div>
              {payout.payment_method ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Méthode</dt>
                  <dd className="mt-0.5 capitalize text-app-ink">
                    {payout.payment_method.replace(/_/g, ' ')}
                  </dd>
                </div>
              ) : null}
              {payout.processed_at ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Effectué le</dt>
                  <dd className="mt-0.5 text-app-ink">
                    {formatDate(payout.processed_at, locale)}
                  </dd>
                </div>
              ) : null}
              {payout.failed_reason ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-destructive">Raison de l&apos;échec</dt>
                  <dd className="mt-0.5 text-app-ink">{payout.failed_reason}</dd>
                </div>
              ) : null}
            </dl>

            {(status === 'pending' || status === 'scheduled' || status === 'processing') ? (
              <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
                <div>
                  <Label htmlFor="transaction-id" className="mb-1.5 block text-xs font-medium">
                    Référence de transaction (optionnelle)
                  </Label>
                  <Input
                    id="transaction-id"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Ex: TX-2025-0001"
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
                    {markProcessed.isPending ? '…' : 'Marquer effectué'}
                  </Button>
                </div>
                <div>
                  <Label htmlFor="failed-reason" className="mb-1.5 block text-xs font-medium">
                    Raison de l&apos;échec
                  </Label>
                  <Input
                    id="failed-reason"
                    value={failedReason}
                    onChange={(e) => setFailedReason(e.target.value)}
                    placeholder="Ex: Compte bancaire invalide"
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
                    {markFailed.isPending ? '…' : "Marquer échoué"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => void handleAction(() => cancel.mutateAsync())}
                  >
                    {cancel.isPending ? '…' : 'Annuler'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button variant="ghost" type="button" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
