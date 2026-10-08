'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  useBeneficiaryPayoutMethods,
  usePayout,
  usePayoutApprove,
  usePayoutCancel,
  usePayoutMarkFailed,
  usePayoutMarkProcessed,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PayoutStatus } from '@/types/invoice';

import { DESTINATION_KINDS_BY_METHOD, PAYMENT_METHOD_VALUES, PAYOUT_STATUS_TONE } from './constants';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface PayoutDetailDialogProps {
  readonly payoutId: number | null;
  readonly onClose: () => void;
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground';

export function PayoutDetailDialog({ payoutId, onClose }: PayoutDetailDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.payoutDetail');
  const tStatus = useTranslations('payments.payoutStatus');
  const tMethod = useTranslations('payments.methods');
  const tKind = useTranslations('payments.payoutMethodKinds');
  const messageErreur = useMessageErreurApi();
  const { data, isLoading, isError, error } = usePayout(payoutId);
  const approve = usePayoutApprove(payoutId ?? 0);
  const markProcessed = usePayoutMarkProcessed(payoutId ?? 0);
  const markFailed = usePayoutMarkFailed(payoutId ?? 0);
  const cancel = usePayoutCancel(payoutId ?? 0);

  const [paymentMethod, setPaymentMethod] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [approveDestinationId, setApproveDestinationId] = useState<string | null>(null);
  const [failedReason, setFailedReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(messageErreur(e, t('actionFailed')));
    }
  };

  const payout = data?.data;
  const status = (payout?.status ?? 'pending') as PayoutStatus;
  const currency = payout?.currency || 'XOF';

  // TCK-587 (ADR-0031 §2) — les transitions sont un geste du personnel tenant `payouts.create`,
  // et jamais du bénéficiaire : le serveur refuse les deux (`PayoutPolicy::update`). Cacher les
  // boutons n'est pas la garde, c'est ne pas proposer un 403.
  const { user } = useAuth();
  const { can: canManage } = useCan('payouts.create');
  const { can: canApprove } = useCan('payouts.approve');
  const isBeneficiary = user != null && payout?.landlord_id === user.id;
  const actionable = status === 'pending' || status === 'scheduled' || status === 'processing';

  // TCK-594 (ADR-0039 §4) — les quatre yeux se DISENT plutôt que de se cacher : celui qui a
  // préparé voit pourquoi il n'approuve pas, celui qui a approuvé pourquoi il ne paie pas. Le
  // serveur refuse dans les deux cas (`SegregationOfDuties`).
  const isIssuer = user != null && payout?.issued_by_id === user.id;
  const isApprover = user != null && payout?.approved_by_id != null && payout.approved_by_id === user.id;

  const method = paymentMethod || payout?.payment_method || '';
  const isCash = method === 'cash';

  // TCK-594 (ADR-0039 §6) — un paiement mobile money ou par virement part vers une destination
  // VÉRIFIÉE du bénéficiaire (sauf la caution rendue au locataire). Sans ce choix, un reversement
  // préparé sans destination — celui d'une facture d'intervention, toujours — ne se payait pas.
  const allowedKinds = DESTINATION_KINDS_BY_METHOD[method as keyof typeof DESTINATION_KINDS_BY_METHOD];
  const needsDestination = allowedKinds !== undefined && payout?.payee_role !== 'tenant';
  const mayPay = actionable && canManage && !isBeneficiary;
  const mayApprove = status === 'awaiting_approval' && canApprove && !isBeneficiary;
  // VERIF-594 N-1 — l'approbateur fixe (ou remplace) la destination en approuvant : approuvé sans
  // destination, un reversement ne se payait plus qu'en espèces ou par chèque. Il ne choisit
  // qu'une destination vérifiée pour l'agence, sous sa forme masquée.
  const approvesDestination = mayApprove && payout?.payee_role !== 'tenant';
  const beneficiaryMethods = useBeneficiaryPayoutMethods(
    payout?.landlord_id,
    (mayPay && needsDestination) || approvesDestination,
  );
  // VERIF-594 M-4 — l'approbation couvre la destination : approuvé, le reversement ne part que vers
  // la destination approuvée (aucune, s'il a été approuvé sans). Le serveur refuse tout le reste.
  const approved = payout?.approved_by_id != null;
  const destinations = (beneficiaryMethods.data?.data ?? []).filter(
    (m) => m.verified && allowedKinds?.includes(m.kind) && (!approved || m.id === payout?.payout_method_id),
  );
  const plannedDestination = payout?.approved_destination_masked ?? payout?.payout_method_masked ?? null;
  const approvableDestinations = (beneficiaryMethods.data?.data ?? []).filter((m) => m.verified);
  // '' : garder la destination prévue (ou n'en fixer aucune). Sans destination prévue, la destination
  // par défaut vérifiée est proposée.
  const approveDestinationValue =
    approveDestinationId ??
    (payout?.payout_method_masked
      ? ''
      : String(approvableDestinations.find((m) => m.is_default)?.id ?? approvableDestinations[0]?.id ?? ''));
  const preselected =
    destinations.find((m) => m.id === payout?.payout_method_id) ?? destinations.find((m) => m.is_default) ?? destinations[0];
  const destination = destinations.find((m) => String(m.id) === destinationId) ?? preselected;
  const canMarkProcessed =
    method !== '' &&
    (isCash ? transactionId.trim() !== '' || cashNote.trim() !== '' : transactionId.trim() !== '') &&
    (!needsDestination || destination !== undefined);

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
          <p className="rounded-xl bg-card p-4 text-sm text-destructive">
            {messageErreur(error, t('notFound'))}
          </p>
        ) : payout ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge tone={PAYOUT_STATUS_TONE[status] ?? 'neutral'} label={tStatus(status)} />
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
              {payout.issuer ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('preparedBy')}</dt>
                  <dd className="mt-0.5 text-foreground">{payout.issuer.name}</dd>
                </div>
              ) : null}
              {payout.approved_at ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('approvedOn')}</dt>
                  <dd className="mt-0.5 text-foreground">{formatDate(payout.approved_at, locale)}</dd>
                </div>
              ) : null}
              {(
                [
                  ['gross', payout.gross_amount],
                  ['commission', payout.commission_amount],
                  ['fees', payout.fees_amount ?? 0],
                ] as const
              ).map(([key, amount]) => (
                <div key={key}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t(key)}</dt>
                  <dd className="mt-0.5 tabular-nums text-foreground">
                    {formatCurrency(amount, locale, { currency })}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('net')}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                  {formatCurrency(payout.net_amount, locale, { currency })}
                </dd>
              </div>
              {payout.payment_method ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('method')}</dt>
                  <dd className="mt-0.5 text-foreground">{tMethod(payout.payment_method)}</dd>
                </div>
              ) : null}
              {payout.destination_masked ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('destination')}</dt>
                  <dd className="mt-0.5 text-foreground">{payout.destination_masked}</dd>
                </div>
              ) : plannedDestination ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {approved ? t('approvedDestination') : t('plannedDestination')}
                  </dt>
                  <dd className="mt-0.5 text-foreground">{plannedDestination}</dd>
                </div>
              ) : null}
              {payout.transaction_id ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('reference')}</dt>
                  <dd className="mt-0.5 text-foreground">{payout.transaction_id}</dd>
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

            {status === 'awaiting_approval' && canApprove && !isBeneficiary ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                {isIssuer ? (
                  <p className="text-sm text-muted-foreground">{t('approveSelfRefused')}</p>
                ) : null}
                {approvesDestination && approvableDestinations.length > 0 ? (
                  <div>
                    <Label htmlFor="payout-approve-destination" className="mb-1.5 block text-xs font-medium">
                      {t('approveDestination')}
                    </Label>
                    <select
                      id="payout-approve-destination"
                      className={SELECT_CLASS}
                      value={approveDestinationValue}
                      onChange={(e) => setApproveDestinationId(e.target.value)}
                    >
                      <option value="">
                        {payout.payout_method_masked
                          ? t('approveKeepDestination', { masked: payout.payout_method_masked })
                          : t('approveNoDestination')}
                      </option>
                      {approvableDestinations.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {t('approveDestinationOption', { kind: tKind(m.kind), masked: m.masked_identifier ?? '' })}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {payout.payout_method_masked || approveDestinationValue !== '' ? null : (
                  <p className="text-sm text-muted-foreground">{t('approveWithoutDestination')}</p>
                )}
                <Button
                  type="button"
                  disabled={isIssuer || approve.isPending}
                  onClick={() =>
                    void handleAction(() =>
                      approve.mutateAsync(
                        approveDestinationValue !== '' ? { payout_method_id: Number(approveDestinationValue) } : undefined,
                      ),
                    )
                  }
                >
                  {approve.isPending ? t('working') : t('approve')}
                </Button>
              </div>
            ) : null}

            {actionable && canManage && !isBeneficiary ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                {isApprover ? (
                  <p className="text-sm text-muted-foreground">{t('paySelfRefused')}</p>
                ) : null}
                <div>
                  <Label htmlFor="payout-pay-method" className="mb-1.5 block text-xs font-medium">
                    {t('method')}
                  </Label>
                  <select
                    id="payout-pay-method"
                    className={SELECT_CLASS}
                    value={method}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="">{tMethod('none')}</option>
                    {PAYMENT_METHOD_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {tMethod(value)}
                      </option>
                    ))}
                  </select>
                </div>
                {needsDestination ? (
                  <div>
                    <Label htmlFor="payout-pay-destination" className="mb-1.5 block text-xs font-medium">
                      {t('payDestination')}
                    </Label>
                    {destinations.length > 0 ? (
                      <select
                        id="payout-pay-destination"
                        className={SELECT_CLASS}
                        value={destination ? String(destination.id) : ''}
                        onChange={(e) => setDestinationId(e.target.value)}
                      >
                        {destinations.map((m) => (
                          <option key={m.id} value={String(m.id)}>
                            {tKind(m.kind)} · {m.masked_identifier ?? ''}
                          </option>
                        ))}
                      </select>
                    ) : beneficiaryMethods.isLoading ? null : (
                      <p className="text-sm text-muted-foreground">
                        {approved ? t('approvedDestinationOnly') : t('noVerifiedDestination')}
                      </p>
                    )}
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="transaction-id" className="mb-1.5 block text-xs font-medium">
                    {isCash ? t('transactionIdOptional') : t('transactionId')}
                  </Label>
                  <Input
                    id="transaction-id"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder={t('transactionIdPlaceholder')}
                  />
                </div>
                {isCash ? (
                  <div>
                    <Label htmlFor="cash-note" className="mb-1.5 block text-xs font-medium">
                      {t('cashNote')}
                    </Label>
                    <Input id="cash-note" value={cashNote} onChange={(e) => setCashNote(e.target.value)} />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={markProcessed.isPending || isApprover || !canMarkProcessed}
                    onClick={() =>
                      void handleAction(() =>
                        markProcessed.mutateAsync({
                          payment_method: method,
                          transaction_id: transactionId.trim() || undefined,
                          notes: cashNote.trim() || undefined,
                          payout_method_id: needsDestination ? destination?.id : undefined,
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

            {actionError ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
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
