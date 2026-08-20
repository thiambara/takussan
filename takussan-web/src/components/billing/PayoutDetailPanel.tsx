'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

import {
  approveAdminPlatformPayout,
  cancelAdminPlatformPayout,
  fetchAdminPlatformPayout,
  markAdminPlatformPayoutPaid,
} from '@/lib/queries/super-admin';
import type { PlatformPayout } from '@/types/super-admin';
import { PayoutStatusPill, formatXof } from './PayoutTable';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export function PayoutDetailPanel({ payoutId, onClose }: { payoutId: number; onClose: () => void }) {
  // Hooks AVANT toute sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('billing.platformPayouts.detail');
  const query = useQuery({
    queryKey: ['super-admin', 'payouts', payoutId],
    queryFn: () => fetchAdminPlatformPayout(payoutId),
  });

  if (query.isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!query.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{t('notFound')}</CardContent>
      </Card>
    );
  }

  return <PayoutActions payout={query.data.data} onClose={onClose} />;
}

function PayoutActions({ payout, onClose }: { payout: PlatformPayout; onClose: () => void }) {
  const t = useTranslations('billing.platformPayouts.detail');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [processedAt, setProcessedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankRef, setBankRef] = useState('');
  const [reason, setReason] = useState('');

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['super-admin', 'payouts'] });
  };

  const approve = useMutation({
    mutationFn: () => approveAdminPlatformPayout(payout.id),
    onSuccess: async () => { toast.add({ title: t('toast.approved'), type: 'success' }); await invalidate(); },
    onError: (error) => toast.add({ title: t('toast.approveFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  const markPaid = useMutation({
    mutationFn: () => markAdminPlatformPayoutPaid(payout.id, {
      processed_at: new Date(processedAt).toISOString(),
      metadata: bankRef ? { bank_ref: bankRef } : undefined,
    }),
    onSuccess: async () => { toast.add({ title: t('toast.markedPaid'), type: 'success' }); await invalidate(); },
    onError: (error) => toast.add({ title: t('toast.markFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  const cancel = useMutation({
    mutationFn: () => cancelAdminPlatformPayout(payout.id, reason),
    onSuccess: async () => { toast.add({ title: t('toast.cancelled'), type: 'success' }); await invalidate(); onClose(); },
    onError: (error) => toast.add({ title: t('toast.cancelFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  const breakdown = payout.breakdown ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{t('title', { id: String(payout.id) })}</span>
          <PayoutStatusPill status={payout.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Item label={t('agency')} value={`#${payout.agency_id}`} />
          <Item label={t('period')} value={formatPeriod(payout)} />
          <Item label={t('currency')} value={payout.currency} />
          <Item label={t('gross')} value={formatXof(payout.gross_amount, payout.currency)} />
          <Item label={t('commission')} value={formatXof(payout.platform_fee_amount, payout.currency)} />
          <Item label={t('net')} value={formatXof(payout.net_amount, payout.currency)} bold />
        </dl>

        {breakdown ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('breakdown')}</div>
            <div className="grid grid-cols-2 gap-2">
              <BreakdownRow label={t('bookings')} group={breakdown.booking} currency={payout.currency} />
              <BreakdownRow label={t('leases')} group={breakdown.lease} currency={payout.currency} />
            </div>
          </div>
        ) : null}

        {payout.status === 'pending' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={approve.isPending} onClick={() => approve.mutate()}>
              {approve.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {t('approve')}
            </Button>
          </div>
        ) : null}

        {payout.status === 'approved' || payout.status === 'processing' ? (
          <div className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
            <DatePicker value={processedAt} onValueChange={setProcessedAt} aria-label={t('processedAtAria')} />
            <Input placeholder={t('bankRefPlaceholder')} value={bankRef} onChange={(event) => setBankRef(event.target.value)} />
            <Button type="button" disabled={markPaid.isPending} onClick={() => markPaid.mutate()}>
              {markPaid.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {t('markPaid')}
            </Button>
          </div>
        ) : null}

        {payout.status === 'pending' || payout.status === 'approved' ? (
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              placeholder={t('cancelReasonPlaceholder')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={!reason || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {t('cancel')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Item({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={bold ? 'mt-0.5 font-semibold tabular-nums text-foreground' : 'mt-0.5 text-foreground tabular-nums'}>{value}</dd>
    </div>
  );
}

function BreakdownRow({ label, group, currency }: { label: string; group: { count: number; gross: number; fees: number }; currency: string }) {
  const t = useTranslations('billing.platformPayouts.detail');
  return (
    <div className="rounded-md border border-border/40 bg-background p-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">
        {/* `t.rich` et non `t` : les trois `<span>` sont du BALISAGE, pas du texte. Les remplacer
            par une chaîne plate changerait le DOM rendu, ce que TCK-292 s'interdit. */}
        {t.rich('breakdownRow', {
          qty: (chunks) => <span className="font-semibold">{chunks}</span>,
          amount: (chunks) => <span className="tabular-nums">{chunks}</span>,
          fee: (chunks) => <span className="tabular-nums text-muted-foreground">{chunks}</span>,
          count: String(group.count),
          gross: formatXof(group.gross, currency),
          fees: formatXof(group.fees, currency),
        })}
      </div>
    </div>
  );
}

function formatPeriod(payout: PlatformPayout): string {
  const end = payout.period_end ? new Date(payout.period_end).toLocaleDateString('fr-FR') : '—';
  const start = payout.period_start ? new Date(payout.period_start).toLocaleDateString('fr-FR') : '—';
  return `${start} → ${end}`;
}

